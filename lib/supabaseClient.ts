import { createClient } from '@supabase/supabase-js';
import { Turno, Empleado, Asistencia, EstadoFichaje } from '@/types/database';
import { BiometricEngine } from '@/lib/biometrics';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder-project') &&
  !supabaseAnonKey.includes('placeholder-anon-key')
);

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn(
    '[BioAccess Supabase] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no están configuradas con valores válidos. Configúralas en .env.local o en las variables de entorno de Vercel.'
  );
}

// Cliente oficial de Supabase conectado directamente a PostgreSQL en la nube
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// ----------------------------------------------------------------------
// SERVICIOS: TURNOS (Persistencia directa en PostgreSQL Supabase)
// ----------------------------------------------------------------------
export const TurnosService = {
  async getAll(): Promise<Turno[]> {
    const { data, error } = await supabase
      .from('turnos')
      .select('*')
      .order('nombre');

    if (error) {
      console.error('[TurnosService.getAll] Error consultando Supabase:', error.message);
      throw new Error(`Error al consultar turnos en Supabase: ${error.message}`);
    }
    return (data || []) as Turno[];
  },

  async create(turno: Omit<Turno, 'id' | 'created_at'>): Promise<Turno> {
    const { data, error } = await supabase
      .from('turnos')
      .insert([turno])
      .select()
      .single();

    if (error) {
      console.error('[TurnosService.create] Error en Supabase:', error.message);
      throw new Error(`Error al crear turno en Supabase: ${error.message}`);
    }
    return data as Turno;
  },

  async update(id: string, updates: Partial<Turno>): Promise<void> {
    const { error } = await supabase
      .from('turnos')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[TurnosService.update] Error en Supabase:', error.message);
      throw new Error(`Error al actualizar turno en Supabase: ${error.message}`);
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('turnos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[TurnosService.delete] Error en Supabase:', error.message);
      throw new Error(`Error al eliminar turno en Supabase: ${error.message}`);
    }
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: EMPLEADOS (Persistencia directa en PostgreSQL Supabase)
// ----------------------------------------------------------------------
export const EmpleadosService = {
  async getAll(): Promise<Empleado[]> {
    const { data, error } = await supabase
      .from('empleados')
      .select('*, turno:turnos(*)')
      .order('nombre_completo');

    if (error) {
      console.error('[EmpleadosService.getAll] Error consultando Supabase:', error.message);
      throw new Error(`Error al consultar empleados en Supabase: ${error.message}`);
    }
    return (data || []) as Empleado[];
  },

  async getByDocumento(doc: string): Promise<Empleado | null> {
    const cleanDoc = doc.trim();
    if (!cleanDoc) return null;

    const { data, error } = await supabase
      .from('empleados')
      .select('*, turno:turnos(*)')
      .eq('documento', cleanDoc)
      .maybeSingle();

    if (error) {
      console.error('[EmpleadosService.getByDocumento] Error consultando Supabase:', error.message);
      throw new Error(`Error al buscar empleado por DNI en Supabase: ${error.message}`);
    }
    return (data as Empleado) || null;
  },

  async create(emp: Omit<Empleado, 'id' | 'created_at'>): Promise<Empleado> {
    const { data, error } = await supabase
      .from('empleados')
      .insert([emp])
      .select('*, turno:turnos(*)')
      .single();

    if (error) {
      console.error('[EmpleadosService.create] Error en Supabase:', error.message);
      throw new Error(`Error al crear empleado en Supabase: ${error.message}`);
    }
    return data as Empleado;
  },

  async update(id: string, updates: Partial<Empleado>): Promise<void> {
    const { error } = await supabase
      .from('empleados')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[EmpleadosService.update] Error en Supabase:', error.message);
      throw new Error(`Error al actualizar empleado en Supabase: ${error.message}`);
    }
  },

  async saveBiometrics(id: string, descriptor: number[]): Promise<void> {
    // Si estamos en el navegador, invocamos la ruta API centralizada de enrolamiento
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/empleados/enrolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empleado_id: id, descriptor }),
      });
      const data = await res.json().catch(() => ({ success: false, message: 'Error de red.' }));
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Error ${res.status} al guardar biometría en Supabase.`);
      }
      return;
    }

    // Actualización directa en Supabase
    const { error } = await supabase
      .from('empleados')
      .update({
        datos_biometricos: descriptor,
        estado: 'Activo',
      })
      .eq('id', id);

    if (error) {
      console.error('[EmpleadosService.saveBiometrics] Error en Supabase:', error.message);
      throw new Error(`Error al guardar biometría en Supabase: ${error.message}`);
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('empleados')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[EmpleadosService.delete] Error en Supabase:', error.message);
      throw new Error(`Error al eliminar empleado en Supabase: ${error.message}`);
    }
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: ASISTENCIAS (Persistencia directa en PostgreSQL Supabase)
// ----------------------------------------------------------------------
export const AsistenciasService = {
  async getAll(): Promise<Asistencia[]> {
    const { data, error } = await supabase
      .from('asistencias')
      .select('*, empleado:empleados(*, turno:turnos(*))')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AsistenciasService.getAll] Error consultando Supabase:', error.message);
      throw new Error(`Error al consultar asistencias en Supabase: ${error.message}`);
    }
    return (data || []) as Asistencia[];
  },

  async getTodayForEmpleado(empleadoId: string): Promise<Asistencia | null> {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('fecha', todayStr)
      .order('hora_entrada', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[AsistenciasService.getTodayForEmpleado] Error consultando Supabase:', error.message);
      throw new Error(`Error al consultar asistencia del día en Supabase: ${error.message}`);
    }
    return (data as Asistencia) || null;
  },

  async clockIn(
    empleadoId: string, 
    estadoFichaje: EstadoFichaje = 'Normal', 
    fotoExcepcionUrl: string | null = null
  ): Promise<Asistencia> {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const asistenciaData: Omit<Asistencia, 'id' | 'created_at'> = {
      empleado_id: empleadoId,
      fecha: todayStr,
      hora_entrada: now.toISOString(),
      hora_salida: null,
      estado_fichaje: estadoFichaje,
      foto_excepcion: fotoExcepcionUrl,
      horas_trabajadas: null,
      horas_extras: null
    };

    const { data, error } = await supabase
      .from('asistencias')
      .insert([asistenciaData])
      .select('*, empleado:empleados(*, turno:turnos(*))')
      .single();

    if (error) {
      console.error('[AsistenciasService.clockIn] Error en Supabase:', error.message);
      throw new Error(`Error al registrar entrada en Supabase: ${error.message}`);
    }
    return data as Asistencia;
  },

  async clockOut(asistenciaId: string, turno: Turno | null): Promise<Asistencia> {
    const now = new Date();
    const { data: currentRecord, error: fetchErr } = await supabase
      .from('asistencias')
      .select('*')
      .eq('id', asistenciaId)
      .single();

    if (fetchErr || !currentRecord) {
      console.error('[AsistenciasService.clockOut] Error buscando registro:', fetchErr?.message);
      throw new Error('Registro de entrada no encontrado en Supabase');
    }

    const horaEntrada = new Date(currentRecord.hora_entrada);
    const diffMs = Math.max(0, now.getTime() - horaEntrada.getTime());
    const diffHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

    let horasExtras = 0;
    if (turno && diffHours > 8) {
      const extra = diffHours - 8;
      horasExtras = Number(Math.min(extra, turno.max_horas_extras || 2).toFixed(2));
    }

    const updates = {
      hora_salida: now.toISOString(),
      horas_trabajadas: diffHours,
      horas_extras: horasExtras
    };

    const { data, error: updateErr } = await supabase
      .from('asistencias')
      .update(updates)
      .eq('id', asistenciaId)
      .select('*, empleado:empleados(*, turno:turnos(*))')
      .single();

    if (updateErr) {
      console.error('[AsistenciasService.clockOut] Error actualizando Supabase:', updateErr.message);
      throw new Error(`Error al registrar salida en Supabase: ${updateErr.message}`);
    }
    return data as Asistencia;
  },

  async updateEstado(id: string, estado: EstadoFichaje): Promise<void> {
    const { error } = await supabase
      .from('asistencias')
      .update({ estado_fichaje: estado })
      .eq('id', id);

    if (error) {
      console.error('[AsistenciasService.updateEstado] Error en Supabase:', error.message);
      throw new Error(`Error al actualizar estado en Supabase: ${error.message}`);
    }
  },

  async uploadExceptionPhoto(base64Photo: string, empleadoId: string): Promise<string> {
    const filename = `excepcion_${empleadoId}_${Date.now()}.jpg`;
    try {
      const blob = BiometricEngine.dataURLtoBlob(base64Photo);
      const { data, error } = await supabase.storage
        .from('fotos_excepciones')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage
          .from('fotos_excepciones')
          .getPublicUrl(data.path);
        return publicUrlData.publicUrl;
      }
    } catch (err) {
      console.warn('Error al subir imagen a Supabase Storage:', err);
    }
    return base64Photo;
  }
};
