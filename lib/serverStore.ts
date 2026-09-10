import fs from 'fs';
import path from 'path';
import { Turno, Empleado, Asistencia } from '@/types/database';

export interface DatabaseStore {
  turnos: Turno[];
  empleados: Empleado[];
  asistencias: Asistencia[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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

const INITIAL_EMPLEADOS: Empleado[] = [];

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readServerStore(): DatabaseStore {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseStore = {
      turnos: INITIAL_TURNOS,
      empleados: INITIAL_EMPLEADOS,
      asistencias: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content) as DatabaseStore;
  } catch (err) {
    console.error('[ServerStore] Error leyendo DB_FILE:', err);
    return {
      turnos: INITIAL_TURNOS,
      empleados: INITIAL_EMPLEADOS,
      asistencias: []
    };
  }
}

export function writeServerStore(store: DatabaseStore): void {
  ensureDataDir();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ServerStore] Error guardando DB_FILE:', err);
  }
}

export const ServerStore = {
  getAll(): DatabaseStore {
    return readServerStore();
  },

  getEmpleados(): Empleado[] {
    return readServerStore().empleados;
  },

  getTurnos(): Turno[] {
    return readServerStore().turnos;
  },

  getAsistencias(): Asistencia[] {
    return readServerStore().asistencias;
  },

  saveEmpleado(emp: Empleado): Empleado {
    const store = readServerStore();
    const idx = store.empleados.findIndex(e => e.id === emp.id || e.documento === emp.documento);
    if (idx >= 0) {
      store.empleados[idx] = { ...store.empleados[idx], ...emp };
    } else {
      store.empleados.push(emp);
    }
    writeServerStore(store);
    return emp;
  },

  deleteEmpleado(id: string): void {
    const store = readServerStore();
    store.empleados = store.empleados.filter(e => e.id !== id);
    writeServerStore(store);
  },

  saveTurno(turno: Turno): Turno {
    const store = readServerStore();
    const idx = store.turnos.findIndex(t => t.id === turno.id);
    if (idx >= 0) {
      store.turnos[idx] = { ...store.turnos[idx], ...turno };
    } else {
      store.turnos.push(turno);
    }
    writeServerStore(store);
    return turno;
  },

  deleteTurno(id: string): void {
    const store = readServerStore();
    store.turnos = store.turnos.filter(t => t.id !== id);
    writeServerStore(store);
  },

  saveAsistencia(asistencia: Asistencia): Asistencia {
    const store = readServerStore();
    const idx = store.asistencias.findIndex(a => a.id === asistencia.id);
    if (idx >= 0) {
      store.asistencias[idx] = { ...store.asistencias[idx], ...asistencia };
    } else {
      store.asistencias.unshift(asistencia);
    }
    writeServerStore(store);
    return asistencia;
  },

  bulkMerge(incoming: Partial<DatabaseStore>): DatabaseStore {
    const store = readServerStore();

    if (incoming.turnos && incoming.turnos.length > 0) {
      const turnoMap = new Map(store.turnos.map(t => [t.id, t]));
      for (const t of incoming.turnos) {
        turnoMap.set(t.id, t);
      }
      store.turnos = Array.from(turnoMap.values());
    }

    if (incoming.empleados && incoming.empleados.length > 0) {
      const empMap = new Map(store.empleados.map(e => [e.documento, e]));
      for (const e of incoming.empleados) {
        empMap.set(e.documento, e);
      }
      store.empleados = Array.from(empMap.values());
    }

    if (incoming.asistencias && incoming.asistencias.length > 0) {
      const asisArray = [...incoming.asistencias, ...store.asistencias];
      const seen = new Set<string>();
      store.asistencias = asisArray.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
    }

    writeServerStore(store);
    return store;
  }
};
