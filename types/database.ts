export type EstadoEmpleado = 'Activo' | 'Inactivo' | 'Pendiente_Biometria';
export type EstadoFichaje = 'Normal' | 'Requiere_Aprobacion' | 'Rechazado';
export type TipoMarcacion = 'ENTRADA' | 'SALIDA';

export interface Turno {
  id: string;
  nombre: string;
  hora_ingreso: string; // Formato "HH:mm" o "HH:mm:ss"
  hora_salida: string;  // Formato "HH:mm" o "HH:mm:ss"
  max_horas_extras: number;
  created_at?: string;
}

export interface Empleado {
  id: string;
  documento: string;
  nombre_completo: string;
  turno_id: string | null;
  estado: EstadoEmpleado;
  datos_biometricos: string | null; // Vector serializado en JSON (128 floats)
  created_at?: string;
  turno?: Turno | null;
}

export interface Asistencia {
  id: string;
  empleado_id: string;
  fecha: string; // "YYYY-MM-DD"
  hora_entrada: string; // ISO 8601 string
  hora_salida: string | null; // ISO 8601 string
  estado_fichaje: EstadoFichaje;
  foto_excepcion: string | null;
  horas_trabajadas: number | null;
  horas_extras: number | null;
  created_at?: string;
  empleado?: Empleado;
}

export interface Administrador {
  id: string;
  nombre_completo: string;
  rol: string;
  created_at?: string;
}

// ----------------------------------------------------
// TIPOS DE PAYLOADS DE API (Next.js API Routes)
// ----------------------------------------------------

export interface FicharRequestBody {
  documento: string;
  descriptor?: number[] | Float32Array; // Vector facial actual (128 dimensiones)
  esExcepcion?: boolean; // True si la cámara falló o no hubo match facial
  fotoBase64?: string;   // Imagen capturada en base64 para almacenar en Supabase Storage
  esEnrolamiento?: boolean; // Forzar enrolamiento si estaba Pendiente_Biometria
}

export interface FicharResponseData {
  success: boolean;
  mensaje: string;
  tipo?: TipoMarcacion;
  asistencia?: Asistencia;
  empleado?: {
    id: string;
    documento: string;
    nombre_completo: string;
    estado: EstadoEmpleado;
  };
  horasCalculadas?: {
    horasTrabajadas: number;
    horasExtras: number;
  };
  requiereEnrolamiento?: boolean;
}

export type ExcepcionAccion = 'APROBAR' | 'RECHAZAR' | 'APROBAR_RECALIBRAR';

export interface ExcepcionRequestBody {
  asistencia_id: string;
  accion: ExcepcionAccion;
  nuevo_descriptor?: number[]; // Opcional para recalibración
}

export interface EmpleadoCreateRequestBody {
  documento: string;
  nombre_completo: string;
  turno_id?: string | null;
  estado?: EstadoEmpleado;
  datos_biometricos?: number[] | string | null;
}

export interface EmpleadoUpdateRequestBody {
  id: string;
  documento?: string;
  nombre_completo?: string;
  turno_id?: string | null;
  estado?: EstadoEmpleado;
  datos_biometricos?: number[] | string | null;
}
