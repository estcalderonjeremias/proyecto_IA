import { NextRequest, NextResponse } from 'next/server';
import { EmpleadosService, isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { EmpleadoCreateRequestBody, EmpleadoUpdateRequestBody } from '@/types/database';

/**
 * GET /api/empleados
 * Obtiene la lista completa de empleados con su respectivo turno asignado
 */
export async function GET() {
  try {
    const empleados = await EmpleadosService.getAll();
    return NextResponse.json({
      success: true,
      empleados,
    });
  } catch (error: any) {
    console.error('Error al listar empleados:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error al obtener empleados' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/empleados
 * Crea un nuevo empleado en el sistema (por defecto con estado 'Pendiente_Biometria')
 */
export async function POST(req: NextRequest) {
  try {
    const body: EmpleadoCreateRequestBody = await req.json();
    const { documento, nombre_completo, turno_id, estado, datos_biometricos } = body;

    if (!documento || !documento.trim() || !nombre_completo || !nombre_completo.trim()) {
      return NextResponse.json(
        { success: false, mensaje: 'Documento y nombre completo son campos obligatorios' },
        { status: 400 }
      );
    }

    const cleanDoc = documento.trim();

    // Validar si el documento ya está registrado
    const existente = await EmpleadosService.getByDocumento(cleanDoc);
    if (existente) {
      return NextResponse.json(
        { success: false, mensaje: `Ya existe un empleado registrado con el documento ${cleanDoc}` },
        { status: 409 }
      );
    }

    // Serializar descriptor si viene en array
    let biometriaString: string | null = null;
    if (datos_biometricos) {
      biometriaString = typeof datos_biometricos === 'string'
        ? datos_biometricos
        : JSON.stringify(datos_biometricos);
    }

    const estadoFinal = estado || (biometriaString ? 'Activo' : 'Pendiente_Biometria');

    const nuevoEmpleado = await EmpleadosService.create({
      documento: cleanDoc,
      nombre_completo: nombre_completo.trim(),
      turno_id: turno_id || null,
      estado: estadoFinal,
      datos_biometricos: biometriaString,
    });

    return NextResponse.json(
      {
        success: true,
        mensaje: 'Empleado creado exitosamente',
        empleado: nuevoEmpleado,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error al crear empleado:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error interno al registrar empleado' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/empleados
 * Actualiza los datos de un empleado (estado, turno, nombre, datos biométricos, etc.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body: EmpleadoUpdateRequestBody = await req.json();
    const { id, documento, nombre_completo, turno_id, estado, datos_biometricos } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, mensaje: 'El ID del empleado es obligatorio' },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (documento !== undefined) updates.documento = documento.trim();
    if (nombre_completo !== undefined) updates.nombre_completo = nombre_completo.trim();
    if (turno_id !== undefined) updates.turno_id = turno_id;
    if (estado !== undefined) updates.estado = estado;
    if (datos_biometricos !== undefined) {
      updates.datos_biometricos = typeof datos_biometricos === 'string' || datos_biometricos === null
        ? datos_biometricos
        : JSON.stringify(datos_biometricos);
    }

    await EmpleadosService.update(id, updates);

    return NextResponse.json({
      success: true,
      mensaje: 'Empleado actualizado correctamente',
    });
  } catch (error: any) {
    console.error('Error al actualizar empleado:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error al actualizar empleado' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/empleados
 * Elimina o desactiva un empleado
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, mensaje: 'ID de empleado no especificado' },
        { status: 400 }
      );
    }

    await EmpleadosService.delete(id);

    return NextResponse.json({
      success: true,
      mensaje: 'Empleado eliminado correctamente',
    });
  } catch (error: any) {
    console.error('Error al eliminar empleado:', error);
    return NextResponse.json(
      { success: false, mensaje: error?.message || 'Error al eliminar empleado' },
      { status: 500 }
    );
  }
}
