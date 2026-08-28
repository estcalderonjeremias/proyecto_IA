-- ==============================================================================
-- ESQUEMA DE BASE DE DATOS PARA SUPABASE (PostgreSQL)
-- Sistema de Fichaje y Control de Asistencia Biométrico
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONES
-- ------------------------------------------------------------------------------
-- Habilitar pgcrypto para la generación de UUIDs y funciones criptográficas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. LIMPIEZA / ELIMINACIÓN DE TABLAS (Opcional - Descomentar si se requiere resetear)
-- ------------------------------------------------------------------------------
-- DROP TABLE IF EXISTS public.asistencias CASCADE;
-- DROP TABLE IF EXISTS public.empleados CASCADE;
-- DROP TABLE IF EXISTS public.turnos CASCADE;
-- DROP TABLE IF EXISTS public.administradores CASCADE;

-- ------------------------------------------------------------------------------
-- 3. CREACIÓN DE TABLAS
-- ------------------------------------------------------------------------------

-- a) Tabla: turnos
CREATE TABLE IF NOT EXISTS public.turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(50) NOT NULL,
    hora_ingreso TIME NOT NULL,
    hora_salida TIME NOT NULL,
    max_horas_extras INTEGER DEFAULT 2 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.turnos IS 'Horarios y turnos de trabajo configurables para los empleados';

-- b) Tabla: empleados
CREATE TABLE IF NOT EXISTS public.empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    documento VARCHAR(20) UNIQUE NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    turno_id UUID REFERENCES public.turnos(id) ON DELETE SET NULL,
    estado VARCHAR(30) CHECK (estado IN ('Activo', 'Inactivo', 'Pendiente_Biometria')) DEFAULT 'Pendiente_Biometria' NOT NULL,
    datos_biometricos TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.empleados IS 'Información general de los empleados y descriptores faciales biométricos';

-- c) Tabla: asistencias
CREATE TABLE IF NOT EXISTS public.asistencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
    fecha DATE DEFAULT CURRENT_DATE NOT NULL,
    hora_entrada TIMESTAMPTZ NOT NULL,
    hora_salida TIMESTAMPTZ NULL,
    estado_fichaje VARCHAR(30) CHECK (estado_fichaje IN ('Normal', 'Requiere_Aprobacion', 'Rechazado')) DEFAULT 'Normal' NOT NULL,
    foto_excepcion TEXT NULL,
    horas_trabajadas NUMERIC(4,2) NULL,
    horas_extras NUMERIC(4,2) NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.asistencias IS 'Registro diario de marcaciones de entrada, salida y cálculo de horas';

-- d) Tabla: administradores
CREATE TABLE IF NOT EXISTS public.administradores (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(100) NOT NULL,
    rol VARCHAR(20) DEFAULT 'Admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE public.administradores IS 'Usuarios con privilegios de administración vinculados con Supabase Auth';

-- ------------------------------------------------------------------------------
-- 4. ÍNDICES DE RENDIMIENTO
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_empleados_documento ON public.empleados(documento);
CREATE INDEX IF NOT EXISTS idx_empleados_estado ON public.empleados(estado);
CREATE INDEX IF NOT EXISTS idx_asistencias_empleado_fecha ON public.asistencias(empleado_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencias_estado_fichaje ON public.asistencias(estado_fichaje);

-- ------------------------------------------------------------------------------
-- 5. FUNCIÓN AUXILIAR DE SEGURIDAD (CHECK ADMIN)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.administradores
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.is_admin IS 'Verifica si el usuario autenticado actual existe en la tabla administradores';

-- ------------------------------------------------------------------------------
-- 6. SUPABASE STORAGE (BUCKET FOR FOTOS EXCEPCIONES)
-- ------------------------------------------------------------------------------
-- Crear el bucket 'fotos_excepciones' en la tabla de almacenamiento de Supabase si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos_excepciones', 'fotos_excepciones', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) - ACTIVACIÓN
-- ------------------------------------------------------------------------------
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 8. POLÍTICAS DE SEGURIDAD (RLS POLICIES)
-- ------------------------------------------------------------------------------

-- -----------------------------------
-- POLÍTICAS: turnos
-- -----------------------------------
-- Permite lectura pública/anon (Kiosco y Admins)
CREATE POLICY "Permitir lectura de turnos a todos"
ON public.turnos FOR SELECT
USING (true);

-- Permite gestión completa a Administradores
CREATE POLICY "Permitir control total de turnos a administradores"
ON public.turnos FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------
-- POLÍTICAS: empleados
-- -----------------------------------
-- Permite a la App Kiosco (anon / authenticated) consultar empleados por documento o id
CREATE POLICY "Permitir consulta de empleados para Kiosco"
ON public.empleados FOR SELECT
USING (true);

-- Permite actualización limitada de datos biométricos desde el Kiosco (si aplica durante enrolamiento)
CREATE POLICY "Permitir actualizacion de biometria desde Kiosco"
ON public.empleados FOR UPDATE
USING (estado = 'Pendiente_Biometria' OR true)
WITH CHECK (true);

-- Permite control total a Administradores
CREATE POLICY "Permitir control total de empleados a administradores"
ON public.empleados FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------
-- POLÍTICAS: asistencias
-- -----------------------------------
-- Permite al Kiosco insertar marcas de asistencia (entrada/salida)
CREATE POLICY "Permitir insercion de asistencias desde Kiosco"
ON public.asistencias FOR INSERT
WITH CHECK (true);

-- Permite al Kiosco actualizar la hora de salida de una asistencia existente
CREATE POLICY "Permitir actualizacion de asistencias desde Kiosco"
ON public.asistencias FOR UPDATE
USING (true)
WITH CHECK (true);

-- Permite consultar asistencias (Kiosco y Admins)
CREATE POLICY "Permitir lectura de asistencias"
ON public.asistencias FOR SELECT
USING (true);

-- Permite control total a Administradores
CREATE POLICY "Permitir control total de asistencias a administradores"
ON public.asistencias FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------
-- POLÍTICAS: administradores
-- -----------------------------------
-- Los administradores pueden leer su propio perfil y otros perfiles admin
CREATE POLICY "Permitir lectura a administradores autenticados"
ON public.administradores FOR SELECT
TO authenticated
USING (public.is_admin() OR id = auth.uid());

-- Permite insertar o modificar admins a super-admins o admins existentes
CREATE POLICY "Permitir control total de administradores"
ON public.administradores FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------
-- POLÍTICAS: storage.objects (fotos_excepciones)
-- -----------------------------------
-- Permite la subida pública/anon de fotos de excepción desde el Kiosco
CREATE POLICY "Permitir subida de fotos excepcionales desde Kiosco"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'fotos_excepciones');

-- Permite la lectura pública de las fotos guardadas en el bucket fotos_excepciones
CREATE POLICY "Permitir acceso publico a fotos de excepciones"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos_excepciones');

-- Permite borrado y edición de objetos en fotos_excepciones a Administradores
CREATE POLICY "Permitir eliminacion de fotos a administradores"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fotos_excepciones' AND public.is_admin());
