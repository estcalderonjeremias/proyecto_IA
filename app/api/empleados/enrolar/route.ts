import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { parseDescriptor } from '@/lib/biometrics';
import { Empleado } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      empleado_id,
      documento,
      dni,
      nombre_completo,
      turno_id,
      descriptor,
      datos_biometricos,
    } = body;

    // Vector biométrico recibido (128 números flotantes)
    const rawVector = descriptor || datos_biometricos;
    const parsedVector = parseDescriptor(rawVector);

    if (!parsedVector || parsedVector.length !== 128) {
      return NextResponse.json(
        {
          success: false,
          message: `Vector biométrico inválido. Se requiere un arreglo de 128 números flotantes (recibidos: ${
            parsedVector ? parsedVector.length : 0
          }).`,
        },
        { status: 400 }
      );
    }

    const cleanDoc = String(documento || dni || '').trim();

    if (!cleanDoc && !empleado_id) {
      return NextResponse.json(
        {
          success: false,
          message: 'Se requiere el número de documento (DNI) o el ID del empleado.',
        },
        { status: 400 }
      );
    }

    // 1. Buscar al empleado en Supabase directamente
    let existingEmployee: Empleado | null = null;

    if (empleado_id) {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, turno:turnos(*)')
        .eq('id', empleado_id)
        .maybeSingle();

      if (!error && data) {
        existingEmployee = data as Empleado;
      }
    }

    if (!existingEmployee && cleanDoc) {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, turno:turnos(*)')
        .eq('documento', cleanDoc)
        .maybeSingle();

      if (!error && data) {
        existingEmployee = data as Empleado;
      }
    }

    let savedEmployee: Empleado;

    // 2. Si el empleado ya existe en Supabase:
    // Guardamos el arreglo de 128 números en 'datos_biometricos' y cambiamos 'estado' a 'Activo'
    if (existingEmployee) {
      const updates: Partial<Empleado> = {
        datos_biometricos: parsedVector,
        estado: 'Activo',
      };

      if (nombre_completo && String(nombre_completo).trim()) {
        updates.nombre_completo = String(nombre_completo).trim();
      }
      if (turno_id !== undefined) {
        updates.turno_id = turno_id || null;
      }

      const { data, error } = await supabase
        .from('empleados')
        .update(updates)
        .eq('id', existingEmployee.id)
        .select('*, turno:turnos(*)')
        .single();

      if (error) {
        console.error('[POST /api/empleados/enrolar] Error actualizando Supabase:', error.message);
        return NextResponse.json(
          {
            success: false,
            message: `Error al guardar biometría en Supabase: ${error.message}`,
          },
          { status: 500 }
        );
      }

      savedEmployee = data as Empleado;

      return NextResponse.json({
        success: true,
        message: `Enrolamiento biométrico completado con éxito para ${savedEmployee.nombre_completo}. Estado actualizado a 'Activo'.`,
        empleado: savedEmployee,
      });
    }

    // 3. Si el empleado no existía previamente, lo creamos directamente en estado 'Activo'
    const newEmployeeData = {
      documento: cleanDoc,
      nombre_completo:
        (nombre_completo && String(nombre_completo).trim()) || `Empleado DNI ${cleanDoc}`,
      turno_id: turno_id || null,
      estado: 'Activo' as const,
      datos_biometricos: parsedVector,
    };

    const { data, error } = await supabase
      .from('empleados')
      .insert([newEmployeeData])
      .select('*, turno:turnos(*)')
      .single();

    if (error) {
      console.error('[POST /api/empleados/enrolar] Error insertando en Supabase:', error.message);
      return NextResponse.json(
        {
          success: false,
          message: `Error al insertar nuevo empleado en Supabase: ${error.message}`,
        },
        { status: 500 }
      );
    }

    savedEmployee = data as Empleado;

    return NextResponse.json(
      {
        success: true,
        message: `Nuevo empleado registrado y enrolado exitosamente en Supabase con estado 'Activo'.`,
        empleado: savedEmployee,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error en /api/empleados/enrolar:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno al procesar el enrolamiento.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
