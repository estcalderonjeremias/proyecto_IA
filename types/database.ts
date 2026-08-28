export type EstadoEmpleado = 'Activo' | 'Inactivo' | 'Pendiente_Biometria';
export type EstadoFichaje = 'Normal' | 'Requiere_Aprobacion' | 'Rechazado';
export type TipoMarcacion = 'ENTRADA' | 'SALIDA';

export interface Turno {
  id: string;
  nombre: string;
  hora_ingreso: string;
  hora_salida: string;
  max_horas_extras: number;
  created_at?: string;
}

export interface Empleado {
  id: string;
  documento: string;
  nombre_completo: string;
  turno_id: string | null;
  estado: EstadoEmpleado;
  datos_biometricos: string | null;
  created_at?: string;
  turno?: Turno;
}

export interface Asistencia {
  id: string;
  empleado_id: string;
  fecha: string;
  hora_entrada: string;
  hora_salida: string | null;
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

export interface BiometricResult {
  success: boolean;
  score: number;
  message: string;
}
