# 🛡️ BioAccess Web — Sistema de Control de Asistencia y Fichaje Biométrico (Vercel Ready)

Aplicación Web Full-Stack moderna para el control de asistencia laboral mediante reconocimiento facial y terminal Kiosco interactivo con pantalla completa nativa, desarrollada con **Next.js (App Router con TypeScript)**, **Tailwind CSS (Dark Theme Neon Green)** y **Supabase (PostgreSQL + Storage)**, 100% optimizada para desplegarse en **Vercel**.

---

## 🚀 Stack Tecnológico

- **Framework:** Next.js 14 (App Router con TypeScript)
- **Despliegue:** Optimizado para Vercel
- **Estilos:** Tailwind CSS con paleta oscura (`#0B0F17`, `#1E2640`) y acentos Neón Verde (`#10B981`, `#22C55E`)
- **Base de Datos & Storage:** Supabase (`@supabase/supabase-js`)
- **Cámara & Biometría:** API nativa `navigator.mediaDevices.getUserMedia` y motor de extracción vectorial facial
- **Modo Kiosco Web:** API nativa `document.documentElement.requestFullscreen()`
- **Audio Feedback:** Web Audio API (efectos sonoros sintetizados en tiempo real)

---

## 📦 Despliegue en Vercel (1-Click Deploy)

1. Sube este repositorio a tu cuenta de **GitHub**.
2. Ingresa a [Vercel](https://vercel.com/) y selecciona **Add New Project** -> **Import Git Repository**.
3. En el apartado **Environment Variables**, agrega las credenciales de tu proyecto de Supabase:
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://tu-proyecto.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `tu-anon-key-de-supabase`
4. Pulsa **Deploy**. ¡Listo!

---

## 🛠️ Ejecución Local

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Configurar Base de Datos en Supabase
1. Abre tu panel en [Supabase](https://supabase.com/).
2. Dirígete a **SQL Editor**.
3. Pega y ejecuta el contenido del archivo [`base_de_datos.sql`](./base_de_datos.sql).
   - Creará automáticamente las tablas (`turnos`, `empleados`, `asistencias`, `administradores`), el bucket de Storage `fotos_excepciones` y las políticas de Row Level Security (RLS).

### 3. Configurar Variables de Entorno
Copia el archivo `.env.local.example` a `.env.local`:
```bash
cp .env.local.example .env.local
```
Edita `.env.local` con las claves de tu proyecto:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 4. Iniciar Servidor Local
```bash
npm run dev
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

---

## 🌟 Funcionalidades y Vistas

### 📟 Modo Kiosco de Fichaje
- **Reloj Digital:** Hora exacta con segundos y fecha en tiempo real.
- **Botón Pantalla Completa Web:** Maximiza la app para terminales táctiles tipo Kiosco.
- **Sensor de Cámara:** Detección de rostro con escáner láser verde neón.
- **Numpad Táctil:** Ingreso ágil de DNI con sonido interactivo.
- **5 Estados Visuales:**
  1. *Reposo*: Esperando DNI o rostro frente a la cámara.
  2. *Escaneando*: Barra láser verde activa y análisis biométrico.
  3. *Éxito*: Tarjeta verde de confirmación (Entrada / Salida y cálculo de horas trabajadas).
  4. *Excepción por Falla*: Tarjeta amarilla ("Rostro no reconocido. Tomando foto de seguridad...") y subida automática a Supabase Storage.
  5. *Onboarding*: Modal interactivo para capturar el rostro por primera vez si el empleado está `Pendiente_Biometria`.

### 📊 Dashboard de Administración
- **Sidebar Oscuro:** Navegación fluida y acentos verde neón.
- **Tarjetas KPIs:** Presentes hoy, Tardanzas detectadas, Excepciones pendientes y Horas extras totales.
- **Módulo de Aprobación de Excepciones:** Visualizador de fotografías capturadas con las 3 opciones de resolución:
  1. `Aprobar`: Valida la marcación como `Normal`.
  2. `Rechazar (Fraude)`: Registra el intento como `Rechazado`.
  3. `Aprobar y Re-calibrar Rostro`: Aprueba la asistencia y marca al empleado como `Pendiente_Biometria` para que vuelva a enrolar su rostro en el próximo fichaje.
- **Gestión de Empleados:** CRUD completo, asignación de turnos y estados.
- **Gestión de Turnos:** Configuración de rangos horarios y límites de horas extras.
