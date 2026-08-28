import { Turno } from '@/types/database';

export interface CalculationResult {
  horasTrabajadas: number;
  horasExtras: number;
  jornadaNormalHoras: number;
}

/**
 * Parsea un string en formato "HH:mm" o "HH:mm:ss" a minutos desde las 00:00
 */
function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 60 + minutes;
}

/**
 * Calcula la duración teórica de la jornada de un turno en horas.
 * Soporta turnos diurnos y turnos que cruzan la medianoche.
 */
export function calcularDuracionTurnoHoras(turno?: Turno | null): number {
  if (!turno || !turno.hora_ingreso || !turno.hora_salida) {
    return 8.0; // Jornada estándar por defecto (8 horas)
  }

  const ingresoMin = timeStringToMinutes(turno.hora_ingreso);
  const salidaMin = timeStringToMinutes(turno.hora_salida);

  let diffMin = salidaMin - ingresoMin;
  if (diffMin <= 0) {
    // Cruza la medianoche (ej: 22:00 a 06:00)
    diffMin += 24 * 60;
  }

  return Number((diffMin / 60).toFixed(2));
}

/**
 * Calcula las horas trabajadas totales y las horas extras estrictamente limitadas a un máximo de 2.0 horas.
 * 
 * Regla de negocio:
 * - Horas trabajadas = Diferencia real entre hora_entrada y hora_salida.
 * - Horas extras = max(0, horas_trabajadas - duracion_turno).
 * - REGLA CRÍTICA: Las horas extras se truncan a un máximo estricto de 2.0 (o turno.max_horas_extras).
 * 
 * @param horaEntrada Fecha/Hora de entrada (ISO string o Date)
 * @param horaSalida Fecha/Hora de salida (ISO string o Date)
 * @param turno Configuración del turno asignado (opcional)
 */
export function calcularHoras(
  horaEntrada: string | Date,
  horaSalida: string | Date,
  turno?: Turno | null
): CalculationResult {
  const start = new Date(horaEntrada).getTime();
  const end = new Date(horaSalida).getTime();

  if (isNaN(start) || isNaN(end) || end <= start) {
    return {
      horasTrabajadas: 0,
      horasExtras: 0,
      jornadaNormalHoras: calcularDuracionTurnoHoras(turno),
    };
  }

  // Diferencia real trabajada en horas
  const diffMillis = end - start;
  const horasReales = diffMillis / (1000 * 60 * 60);
  const horasTrabajadas = Number(horasReales.toFixed(2));

  // Duración estándar del turno
  const jornadaNormalHoras = calcularDuracionTurnoHoras(turno);

  // Límite estricto de horas extras (por defecto 2.0)
  const maxHorasExtras = turno?.max_horas_extras !== undefined ? Number(turno.max_horas_extras) : 2.0;

  // Cálculo de horas extras
  let horasExtras = 0;
  if (horasTrabajadas > jornadaNormalHoras) {
    const exceso = horasTrabajadas - jornadaNormalHoras;
    // REGLA CRÍTICA: Truncar estrictamente al máximo permitido (ej. 2.0 horas)
    horasExtras = Math.min(exceso, maxHorasExtras);
    horasExtras = Number(horasExtras.toFixed(2));
  }

  return {
    horasTrabajadas,
    horasExtras,
    jornadaNormalHoras,
  };
}
