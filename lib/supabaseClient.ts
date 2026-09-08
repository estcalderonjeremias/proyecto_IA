import { createClient } from '@supabase/supabase-js';
import { Turno, Empleado, Asistencia, EstadoFichaje } from '@/types/database';
import { BiometricEngine } from '@/lib/biometrics';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder-project') &&
  !supabaseAnonKey.includes('placeholder-anon-key')
);

// Cliente oficial de Supabase conectado directamente a PostgreSQL en la nube
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder-project.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// ----------------------------------------------------------------------
// DATOS MOCK / CACHE RESILIENTE (Para funcionamiento offline o local)
// ----------------------------------------------------------------------
const INITIAL_TURNOS: Turno[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    nombre: 'Turno Mañana (08:00 - 16:00)',
    hora_ingreso: '08:00:00',
    hora_salida: '16:00:00',
    max_horas_extras: 2,
    created_at: new Date().toISOString()
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    nombre: 'Turno Tarde (14:00 - 22:00)',
    hora_ingreso: '14:00:00',
    hora_salida: '22:00:00',
    max_horas_extras: 3,
    created_at: new Date().toISOString()
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    nombre: 'Turno Noche (22:00 - 06:00)',
    hora_ingreso: '22:00:00',
    hora_salida: '06:00:00',
    max_horas_extras: 2,
    created_at: new Date().toISOString()
  }
];

const INITIAL_EMPLEADOS: Empleado[] = [
  {
    id: 'e1111111-1111-1111-1111-111111111111',
    documento: '40123456',
    nombre_completo: 'Carlos Eduardo Ramírez',
    turno_id: '11111111-1111-1111-1111-111111111111',
    estado: 'Pendiente_Biometria',
    datos_biometricos: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'e2222222-2222-2222-2222-222222222222',
    documento: '38987654',
    nombre_completo: 'María Valentina Gómez',
    turno_id: '11111111-1111-1111-1111-111111111111',
    estado: 'Activo',
    datos_biometricos: new Array(128).fill(0).map((_, i) => Math.sin(i / 10)),
    created_at: new Date().toISOString()
  },
  {
    id: 'e3333333-3333-3333-3333-333333333333',
    documento: '45678901',
    nombre_completo: 'Alejandro Morales',
    turno_id: '22222222-2222-2222-2222-222222222222',
    estado: 'Pendiente_Biometria',
    datos_biometricos: null,
    created_at: new Date().toISOString()
  }
];

class LocalStoreManager {
  private get<T>(key: string, def: T): T {
    if (typeof window === 'undefined') return def;
    try {
      const item = localStorage.getItem(`bioaccess_${key}`);
      return item ? JSON.parse(item) : def;
    } catch {
      return def;
    }
  }

  private set<T>(key: string, val: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`bioaccess_${key}`, JSON.stringify(val));
    } catch {
      // Ignore
    }
  }

  getTurnos(): Turno[] { return this.get<Turno[]>('turnos', INITIAL_TURNOS); }
  setTurnos(t: Turno[]) { this.set('turnos', t); }
  saveTurno(t: Turno) {
    const list = this.getTurnos().filter(x => x.id !== t.id);
    list.push(t);
    this.setTurnos(list);
  }
  deleteTurno(id: string) {
    this.setTurnos(this.getTurnos().filter(t => t.id !== id));
  }

  getEmpleados(): Empleado[] { return this.get<Empleado[]>('empleados', INITIAL_EMPLEADOS); }
  setEmpleados(e: Empleado[]) { this.set('empleados', e); }
  saveEmpleado(e: Empleado) {
    const list = this.getEmpleados().filter(x => x.id !== e.id);
    list.push(e);
    this.setEmpleados(list);
  }
  deleteEmpleado(id: string) {
    this.setEmpleados(this.getEmpleados().filter(e => e.id !== id));
  }

  getAsistencias(): Asistencia[] { return this.get<Asistencia[]>('asistencias', []); }
  setAsistencias(a: Asistencia[]) { this.set('asistencias', a); }
  saveAsistencia(a: Asistencia) {
    const list = this.getAsistencias().filter(x => x.id !== a.id);
    list.unshift(a);
    this.setAsistencias(list);
  }
}

export const LocalStore = new LocalStoreManager();

// ----------------------------------------------------------------------
// SINCRONIZACIÓN CENTRAL EN RED LOCAL (Multi-dispositivo sin Supabase)
// ----------------------------------------------------------------------
async function syncServer(action?: string, data?: unknown) {
  if (typeof window === 'undefined') return null;
  try {
    if (!action) {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        return json.success ? json.data : null;
      }
    } else {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
      });
      if (res.ok) {
        const json = await res.json();
        return json.success ? json.data : null;
      }
    }
  } catch (err) {
    console.warn('[syncServer] Error de sincronización con el servidor central:', err);
  }
  return null;
}

// Subir datos locales guardados previamente en este navegador al servidor central al cargar
if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const localTurnos = LocalStore.getTurnos();
      const localEmpleados = LocalStore.getEmpleados();
      const localAsistencias = LocalStore.getAsistencias();
      if (localEmpleados.length > 0 || localTurnos.length > 0) {
        await syncServer('bulkMerge', {
          turnos: localTurnos,
          empleados: localEmpleados,
          asistencias: localAsistencias,
        });
      }
    } catch {
      // Ignorar errores de conexión inicial
    }
  }, 400);
}

// ----------------------------------------------------------------------
// SERVICIOS: TURNOS
// ----------------------------------------------------------------------
export const TurnosService = {
  async getAll(): Promise<Turno[]> {
    const localTurnos = LocalStore.getTurnos();
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('turnos')
          .select('*')
          .order('nombre');

        if (!error && data) {
          const supabaseList = data as Turno[];
          const supabaseIds = new Set(supabaseList.map(t => t.id));
          const localOnly = localTurnos.filter(t => !supabaseIds.has(t.id));
          const merged = [...supabaseList, ...localOnly];
          LocalStore.setTurnos(merged);
          return merged;
        }
        if (error) {
          console.warn('[TurnosService.getAll] Supabase retornó error:', error.message);
        }
      } catch (err) {
        console.warn('[TurnosService.getAll] Fallo de conexión con Supabase:', err);
      }
      return localTurnos;
    }

    // Modo Servidor Central (Sincronizado entre dispositivos)
    const serverData = await syncServer();
    if (serverData && Array.isArray(serverData.turnos)) {
      LocalStore.setTurnos(serverData.turnos);
      return serverData.turnos;
    }

    return localTurnos;
  },

  async create(turno: Omit<Turno, 'id' | 'created_at'>): Promise<Turno> {
    const newTurno: Turno = {
      ...turno,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    // Guardado inmediato en el almacén local
    LocalStore.saveTurno(newTurno);

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('turnos')
          .insert([{
            id: newTurno.id,
            nombre: turno.nombre,
            hora_ingreso: turno.hora_ingreso,
            hora_salida: turno.hora_salida,
            max_horas_extras: turno.max_horas_extras,
          }])
          .select()
          .single();

        if (!error && data) {
          const created = data as Turno;
          LocalStore.saveTurno(created);
          return created;
        }
        if (error) {
          console.warn('[TurnosService.create] Supabase devolvió error (posible política RLS):', error.message);
        }
      } catch (err) {
        console.warn('[TurnosService.create] Error de conexión con Supabase:', err);
      }
    } else {
      // Guardar en el servidor central
      await syncServer('saveTurno', newTurno);
    }

    return newTurno;
  },

  async update(id: string, updates: Partial<Turno>): Promise<void> {
    const current = LocalStore.getTurnos().find(t => t.id === id);
    const updated = current ? { ...current, ...updates } : null;
    if (updated) {
      LocalStore.saveTurno(updated);
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('turnos')
          .update(updates)
          .eq('id', id);

        if (error) {
          console.warn('[TurnosService.update] Error en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[TurnosService.update] Conexión fallida con Supabase:', err);
      }
    } else if (updated) {
      await syncServer('saveTurno', updated);
    }
  },

  async delete(id: string): Promise<void> {
    LocalStore.deleteTurno(id);

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('turnos')
          .delete()
          .eq('id', id);

        if (error) {
          console.warn('[TurnosService.delete] Error en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[TurnosService.delete] Conexión fallida con Supabase:', err);
      }
    } else {
      await syncServer('deleteTurno', { id });
    }
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: EMPLEADOS
// ----------------------------------------------------------------------
export const EmpleadosService = {
  async getAll(): Promise<Empleado[]> {
    const localEmpleados = LocalStore.getEmpleados();
    const turnos = await TurnosService.getAll();

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .order('nombre_completo');

        if (!error && data) {
          const supabaseList = data as Empleado[];
          const supabaseIds = new Set(supabaseList.map(e => e.id));
          const localOnly = localEmpleados.filter(e => !supabaseIds.has(e.id));
          const merged = [...supabaseList, ...localOnly];
          LocalStore.setEmpleados(merged);
          return merged;
        }
        if (error) {
          console.warn('[EmpleadosService.getAll] Supabase retornó error:', error.message);
        }
      } catch (err) {
        console.warn('[EmpleadosService.getAll] Fallo de conexión con Supabase:', err);
      }
      return localEmpleados.map(e => ({
        ...e,
        turno: turnos.find(t => t.id === e.turno_id)
      }));
    }

    // Modo Servidor Central (Sincronizado entre computadoras y celulares)
    const serverData = await syncServer();
    if (serverData && Array.isArray(serverData.empleados)) {
      LocalStore.setEmpleados(serverData.empleados);
      return serverData.empleados.map((e: Empleado) => ({
        ...e,
        turno: turnos.find(t => t.id === e.turno_id)
      }));
    }

    return localEmpleados.map(e => ({
      ...e,
      turno: turnos.find(t => t.id === e.turno_id)
    }));
  },

  async getByDocumento(doc: string): Promise<Empleado | null> {
    const cleanDoc = doc.trim();
    if (!cleanDoc) return null;

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('documento', cleanDoc)
          .maybeSingle();

        if (!error && data) {
          return data as Empleado;
        }
        if (error) {
          console.warn('[EmpleadosService.getByDocumento] Supabase retornó error:', error.message);
        }
      } catch (err) {
        console.warn('[EmpleadosService.getByDocumento] Conexión fallida con Supabase:', err);
      }
    }

    const turnos = await TurnosService.getAll();
    let local = LocalStore.getEmpleados().find(e => e.documento === cleanDoc);

    // Si no está en LocalStore, consultar al servidor central
    if (!local) {
      const serverData = await syncServer();
      if (serverData && Array.isArray(serverData.empleados)) {
        LocalStore.setEmpleados(serverData.empleados);
        local = serverData.empleados.find((e: Empleado) => e.documento === cleanDoc);
      }
    }

    if (local) {
      return {
        ...local,
        turno: turnos.find(t => t.id === local.turno_id)
      };
    }
    return null;
  },

  async create(emp: Omit<Empleado, 'id' | 'created_at'>): Promise<Empleado> {
    const newEmp: Empleado = {
      ...emp,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    LocalStore.saveEmpleado(newEmp);

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('empleados')
          .insert([{
            id: newEmp.id,
            documento: emp.documento,
            nombre_completo: emp.nombre_completo,
            turno_id: emp.turno_id,
            estado: emp.estado,
            datos_biometricos: emp.datos_biometricos,
          }])
          .select('*, turno:turnos(*)')
          .single();

        if (!error && data) {
          const created = data as Empleado;
          LocalStore.saveEmpleado(created);
          return created;
        }
        if (error) {
          console.warn('[EmpleadosService.create] Error en Supabase, guardando local:', error.message);
        }
      } catch (err) {
        console.warn('[EmpleadosService.create] Conexión fallida con Supabase, guardando local:', err);
      }
    } else {
      // Guardar en el servidor central
      await syncServer('saveEmpleado', newEmp);
    }

    return newEmp;
  },

  async update(id: string, updates: Partial<Empleado>): Promise<void> {
    const current = LocalStore.getEmpleados().find(e => e.id === id);
    const updated = current ? { ...current, ...updates } : null;
    if (updated) {
      LocalStore.saveEmpleado(updated);
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('empleados')
          .update(updates)
          .eq('id', id);

        if (error) {
          console.warn('[EmpleadosService.update] Error en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[EmpleadosService.update] Conexión fallida con Supabase:', err);
      }
    } else if (updated) {
      // Guardar en el servidor central
      await syncServer('saveEmpleado', updated);
    }
  },

  async saveBiometrics(id: string, descriptor: number[]): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/empleados/enrolar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empleado_id: id, descriptor }),
        });
        const data = await res.json().catch(() => ({ success: false }));
        if (res.ok && data.success) {
          if (data.empleado) LocalStore.saveEmpleado(data.empleado);
          return;
        }
      } catch (err) {
        console.warn('[EmpleadosService.saveBiometrics] Falló llamada API, aplicando respaldo local:', err);
      }
    }

    await this.update(id, {
      datos_biometricos: descriptor,
      estado: 'Activo',
    });
  },

  async delete(id: string): Promise<void> {
    LocalStore.deleteEmpleado(id);

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('empleados')
          .delete()
          .eq('id', id);

        if (error) {
          console.warn('[EmpleadosService.delete] Error en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[EmpleadosService.delete] Conexión fallida con Supabase:', err);
      }
    } else {
      await syncServer('deleteEmpleado', { id });
    }
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: ASISTENCIAS
// ----------------------------------------------------------------------
export const AsistenciasService = {
  async getAll(): Promise<Asistencia[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('asistencias')
          .select('*, empleado:empleados(*, turno:turnos(*))')
          .order('created_at', { ascending: false });

        if (!error && data) {
          LocalStore.setAsistencias(data as Asistencia[]);
          return data as Asistencia[];
        }
        if (error) {
          console.warn('[AsistenciasService.getAll] Supabase retornó error:', error.message);
        }
      } catch (err) {
        console.warn('[AsistenciasService.getAll] Fallo de conexión con Supabase:', err);
      }
    } else {
      const serverData = await syncServer();
      if (serverData && Array.isArray(serverData.asistencias)) {
        LocalStore.setAsistencias(serverData.asistencias);
      }
    }

    const emps = await EmpleadosService.getAll();
    return LocalStore.getAsistencias().map(a => ({
      ...a,
      empleado: emps.find(e => e.id === a.empleado_id)
    }));
  },

  async getTodayForEmpleado(empleadoId: string): Promise<Asistencia | null> {
    const todayStr = new Date().toISOString().split('T')[0];

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('asistencias')
          .select('*')
          .eq('empleado_id', empleadoId)
          .eq('fecha', todayStr)
          .order('hora_entrada', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return data as Asistencia;
        }
      } catch (err) {
        console.warn('[AsistenciasService.getTodayForEmpleado] Fallo conexión Supabase:', err);
      }
    } else {
      const serverData = await syncServer();
      if (serverData && Array.isArray(serverData.asistencias)) {
        LocalStore.setAsistencias(serverData.asistencias);
      }
    }

    const list = LocalStore.getAsistencias();
    return list.find(a => a.empleado_id === empleadoId && a.fecha === todayStr) || null;
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

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('asistencias')
          .insert([asistenciaData])
          .select('*, empleado:empleados(*, turno:turnos(*))')
          .single();

        if (!error && data) {
          const created = data as Asistencia;
          LocalStore.saveAsistencia(created);
          return created;
        }
        if (error) {
          console.warn('[AsistenciasService.clockIn] Error en Supabase:', error.message);
        }
      } catch (err) {
        console.warn('[AsistenciasService.clockIn] Conexión fallida con Supabase:', err);
      }
    }

    const newRecord: Asistencia = {
      ...asistenciaData,
      id: crypto.randomUUID(),
      created_at: now.toISOString()
    };
    LocalStore.saveAsistencia(newRecord);

    if (!isSupabaseConfigured) {
      await syncServer('saveAsistencia', newRecord);
    }

    return newRecord;
  },

  async clockOut(asistenciaId: string, turno: Turno | null): Promise<Asistencia> {
    const now = new Date();
    let currentRecord = LocalStore.getAsistencias().find(a => a.id === asistenciaId);

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from('asistencias')
          .select('*')
          .eq('id', asistenciaId)
          .single();
        if (data) currentRecord = data as Asistencia;
      } catch {
        // Use local currentRecord
      }
    } else if (!currentRecord) {
      const serverData = await syncServer();
      if (serverData && Array.isArray(serverData.asistencias)) {
        LocalStore.setAsistencias(serverData.asistencias);
        currentRecord = serverData.asistencias.find((a: Asistencia) => a.id === asistenciaId);
      }
    }

    if (!currentRecord) {
      throw new Error('Registro de entrada no encontrado');
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

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('asistencias')
          .update(updates)
          .eq('id', asistenciaId)
          .select('*, empleado:empleados(*, turno:turnos(*))')
          .single();

        if (!error && data) {
          const updated = data as Asistencia;
          LocalStore.saveAsistencia(updated);
          return updated;
        }
      } catch (err) {
        console.warn('[AsistenciasService.clockOut] Error en Supabase:', err);
      }
    }

    const updatedRecord: Asistencia = { ...currentRecord, ...updates };
    LocalStore.saveAsistencia(updatedRecord);

    if (!isSupabaseConfigured) {
      await syncServer('saveAsistencia', updatedRecord);
    }

    return updatedRecord;
  },

  async updateEstado(id: string, estado: EstadoFichaje): Promise<void> {
    const current = LocalStore.getAsistencias().find(a => a.id === id);
    if (current) {
      const updated = { ...current, estado_fichaje: estado };
      LocalStore.saveAsistencia(updated);
      if (!isSupabaseConfigured) {
        await syncServer('saveAsistencia', updated);
      }
    }

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('asistencias')
          .update({ estado_fichaje: estado })
          .eq('id', id);
      } catch (err) {
        console.warn('[AsistenciasService.updateEstado] Error en Supabase:', err);
      }
    }
  },

  async uploadExceptionPhoto(base64Photo: string, empleadoId: string): Promise<string> {
    const filename = `excepcion_${empleadoId}_${Date.now()}.jpg`;
    if (isSupabaseConfigured) {
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
    }
    return base64Photo;
  }
};
