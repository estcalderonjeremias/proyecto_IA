import { createClient } from '@supabase/supabase-js';
import { Turno, Empleado, Asistencia, EstadoFichaje } from '@/types/database';
import { BiometricEngine } from '@/lib/biometrics';
import { encryptBiometrics } from '@/lib/cryptoBiometrics';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder-project') &&
  !supabaseAnonKey.includes('placeholder-anon-key')
);

// Cliente oficial de Supabase para Next.js / Vercel
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key'
);

// ----------------------------------------------------------------------
// DATOS MOCK DE PRUEBA (Fallback si Supabase no está conectado)
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
    datos_biometricos: JSON.stringify(new Array(128).fill(0).map((_, i) => Math.sin(i / 10))),
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

class StorageMock {
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

  getEmpleados(): Empleado[] { return this.get<Empleado[]>('empleados', INITIAL_EMPLEADOS); }
  setEmpleados(e: Empleado[]) { this.set('empleados', e); }

  getAsistencias(): Asistencia[] { return this.get<Asistencia[]>('asistencias', []); }
  setAsistencias(a: Asistencia[]) { this.set('asistencias', a); }
}

const mockStore = new StorageMock();

// ----------------------------------------------------------------------
// SERVICIOS: TURNOS
// ----------------------------------------------------------------------
export const TurnosService = {
  async getAll(): Promise<Turno[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('turnos').select('*').order('nombre');
      if (!error && data) return data as Turno[];
    }
    return mockStore.getTurnos();
  },

  async create(turno: Omit<Turno, 'id' | 'created_at'>): Promise<Turno> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('turnos').insert([turno]).select().single();
      if (!error && data) return data as Turno;
    }
    const newT: Turno = {
      ...turno,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    const list = mockStore.getTurnos();
    list.push(newT);
    mockStore.setTurnos(list);
    return newT;
  },

  async update(id: string, updates: Partial<Turno>): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('turnos').update(updates).eq('id', id);
      return;
    }
    const list = mockStore.getTurnos().map(t => t.id === id ? { ...t, ...updates } : t);
    mockStore.setTurnos(list);
  },

  async delete(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('turnos').delete().eq('id', id);
      return;
    }
    const list = mockStore.getTurnos().filter(t => t.id !== id);
    mockStore.setTurnos(list);
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: EMPLEADOS
// ----------------------------------------------------------------------
export const EmpleadosService = {
  async getAll(): Promise<Empleado[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('empleados').select('*, turno:turnos(*)').order('nombre_completo');
      if (!error && data) return data as Empleado[];
    }
    const turnos = mockStore.getTurnos();
    return mockStore.getEmpleados().map(e => ({
      ...e,
      turno: turnos.find(t => t.id === e.turno_id)
    }));
  },

  async getByDocumento(doc: string): Promise<Empleado | null> {
    const cleanDoc = doc.trim();
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, turno:turnos(*)')
        .eq('documento', cleanDoc)
        .maybeSingle();
      if (!error && data) return data as Empleado;
    }
    const list = await this.getAll();
    return list.find(e => e.documento === cleanDoc) || null;
  },

  async create(emp: Omit<Empleado, 'id' | 'created_at'>): Promise<Empleado> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('empleados').insert([emp]).select().single();
      if (!error && data) return data as Empleado;
    }
    const newEmp: Empleado = {
      ...emp,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    const list = mockStore.getEmpleados();
    list.push(newEmp);
    mockStore.setEmpleados(list);
    return newEmp;
  },

  async update(id: string, updates: Partial<Empleado>): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('empleados').update(updates).eq('id', id);
      return;
    }
    const list = mockStore.getEmpleados().map(e => e.id === id ? { ...e, ...updates } : e);
    mockStore.setEmpleados(list);
  },

  async saveBiometrics(id: string, descriptor: number[]): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/biometrics/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empleado_id: id, descriptor }),
        });
        if (res.ok) return;
      }
    } catch {
      // Ignorar fallback
    }

    const encrypted = encryptBiometrics(descriptor);
    await this.update(id, {
      datos_biometricos: encrypted,
      estado: 'Activo'
    });
  },

  async delete(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('empleados').delete().eq('id', id);
      return;
    }
    const list = mockStore.getEmpleados().filter(e => e.id !== id);
    mockStore.setEmpleados(list);
  }
};

// ----------------------------------------------------------------------
// SERVICIOS: ASISTENCIAS
// ----------------------------------------------------------------------
export const AsistenciasService = {
  async getAll(): Promise<Asistencia[]> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('asistencias')
        .select('*, empleado:empleados(*)')
        .order('created_at', { ascending: false });
      if (!error && data) return data as Asistencia[];
    }
    const emps = await EmpleadosService.getAll();
    return mockStore.getAsistencias().map(a => ({
      ...a,
      empleado: emps.find(e => e.id === a.empleado_id)
    })).sort((a, b) => new Date(b.hora_entrada).getTime() - new Date(a.hora_entrada).getTime());
  },

  async getTodayForEmpleado(empleadoId: string): Promise<Asistencia | null> {
    const todayStr = new Date().toISOString().split('T')[0];
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from('asistencias')
        .select('*')
        .eq('empleado_id', empleadoId)
        .eq('fecha', todayStr)
        .order('hora_entrada', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data as Asistencia;
    }
    const list = mockStore.getAsistencias();
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
      const { data, error } = await supabase.from('asistencias').insert([asistenciaData]).select().single();
      if (!error && data) return data as Asistencia;
    }

    const newRecord: Asistencia = {
      ...asistenciaData,
      id: crypto.randomUUID(),
      created_at: now.toISOString()
    };
    const list = mockStore.getAsistencias();
    list.unshift(newRecord);
    mockStore.setAsistencias(list);
    return newRecord;
  },

  async clockOut(asistenciaId: string, turno: Turno | null): Promise<Asistencia> {
    const now = new Date();
    let currentRecord: Asistencia | undefined;

    if (isSupabaseConfigured) {
      const { data } = await supabase.from('asistencias').select('*').eq('id', asistenciaId).single();
      currentRecord = data as Asistencia;
    } else {
      currentRecord = mockStore.getAsistencias().find(a => a.id === asistenciaId);
    }

    if (!currentRecord) throw new Error('Registro de entrada no encontrado');

    const horaEntrada = new Date(currentRecord.hora_entrada);
    const diffMs = now.getTime() - horaEntrada.getTime();
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
      const { data } = await supabase.from('asistencias').update(updates).eq('id', asistenciaId).select().single();
      if (data) return data as Asistencia;
    }

    const updatedList = mockStore.getAsistencias().map(a => 
      a.id === asistenciaId ? { ...a, ...updates } : a
    );
    mockStore.setAsistencias(updatedList);
    return { ...currentRecord, ...updates };
  },

  async updateEstado(id: string, estado: EstadoFichaje): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.from('asistencias').update({ estado_fichaje: estado }).eq('id', id);
      return;
    }
    const list = mockStore.getAsistencias().map(a => a.id === id ? { ...a, estado_fichaje: estado } : a);
    mockStore.setAsistencias(list);
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
