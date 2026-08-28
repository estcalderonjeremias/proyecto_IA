import { NextRequest, NextResponse } from 'next/server';
import { AsistenciasService, EmpleadosService, isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { ExcepcionRequestBody, EstadoFichaje } from '@/types/database';

/**
 * GET /api/admin/excepciones
 * Obtiene todas las asistencias con estado 'Requiere_Aprobacion'
 */
export async function GET() {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('asistencias')
        .select('*, empleado:empleados(*, turno:turnos(*))')
        .eq('estado_fichaje', 'Requiere_Aprobacion')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ success: true, excepciones: data });
    }

    const asistencias = await AsistenciasService.getAll();
    const pendientes = asistencias.filter(a => a.estado_fichaje === 'Requiere_Aprobacion');

    return NextResponse.json({ success: true, excepciones: pendientes });
  } catch (error: any) {
    console.error('Error al obtener excepciones:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error al obtener excepciones' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/excepciones
 * Procesa la acción del administrador sobre una asistencia pendiente:
 * - APROBAR: Cambia estado a 'Normal'
 * - RECHAZAR: Cambia estado a 'Rechazado' y anula horas (0)
 * - APROBAR_RECALIBRAR: Cambia estado a 'Normal' y actualiza biometría del empleado
 */
export async function PATCH(req: NextRequest) {
  try {
    const body: ExcepcionRequestBody = await req.json();
    const { asistencia_id, accion, nuevo_descriptor } = body;

    if (!asistencia_id || !accion) {
      return NextResponse.json(
        { success: false, mensaje: 'Faltan parámetros requeridos (asistencia_id, accion)' },
        { status: 400 }
      );
    }

    // 1. Obtener la asistencia actual
    let asistencia;
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('asistencias')
        .select('*, empleado:empleados(*)')
        .eq('id', asistencia_id)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, mensaje: 'Asistencia no encontrada' },
          { status: 404 }
        );
      }
      asistencia = data;
    } else {
      const all = await AsistenciasService.getAll();
      asistencia = all.find(a => a.id === asistencia_id);
      if (!asistencia) {
        return NextResponse.json(
          { success: false, mensaje: 'Asistencia no encontrada' },
          { status: 404 }
        );
      }
    }

    // 2. Ejecutar la acción solicitada
    switch (accion) {
      case 'APROBAR': {
        if (isSupabaseConfigured) {
          await supabase
            .from('asistencias')
            .update({ estado_fichaje: 'Normal' })
            .eq('id', asistencia_id);
        } else {
          await AsistenciasService.updateEstado(asistencia_id, 'Normal');
        }

        return NextResponse.json({
          success: true,
          mensaje: 'Fichaje aprobado exitosamente como Normal',
        });
      }

      case 'RECHAZAR': {
        // En caso de fraude o rechazo, invalidar las horas
        if (isSupabaseConfigured) {
          await supabase
            .from('asistencias')
            .update({
              estado_fichaje: 'Rechazado',
              horas_trabajadas: 0,
              horas_extras: 0,
            })
            .eq('id', asistencia_id);
        } else {
          const list = (await AsistenciasService.getAll()).map(a =>
            a.id === asistencia_id
              ? { ...a, estado_fichaje: 'Rechazado' as EstadoFichaje, horas_trabajadas: 0, horas_extras: 0 }
              : a
          );
          // Actualizar estado en mock
          await AsistenciasService.updateEstado(asistencia_id, 'Rechazado');
        }

        return NextResponse.json({
          success: true,
          mensaje: 'Fichaje rechazado por fraude y horas invalidadas',
        });
      }

      case 'APROBAR_RECALIBRAR': {
        // 1. Aprobar el fichaje
        if (isSupabaseConfigured) {
          await supabase
            .from('asistencias')
            .update({ estado_fichaje: 'Normal' })
            .eq('id', asistencia_id);
        } else {
          await AsistenciasService.updateEstado(asistencia_id, 'Normal');
        }

        // 2. Recalibrar biometría del empleado si se proporcionó un nuevo descriptor
        if (nuevo_descriptor && Array.isArray(nuevo_descriptor) && asistencia.empleado_id) {
          await EmpleadosService.saveBiometrics(asistencia.empleado_id, nuevo_descriptor);
        }

        return NextResponse.json({
          success: true,
          mensaje: 'Fichaje aprobado y biometría del empleado recalibrada exitosamente',
        });
      }

      default:
        return NextResponse.json(
          { success: false, mensaje: `Acción no válida: ${accion}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error al resolver excepción:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error interno al procesar la excepción' },
      { status: 500 }
    );
  }
}
