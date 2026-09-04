import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured, EmpleadosService } from '@/lib/supabaseClient';
import { parseDescriptor } from '@/lib/biometrics';
import { Empleado } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      empleado_id,
      documento,
      nombre_completo,
      turno_id,
      descriptor,
      datos_biometricos,
    } = body;

    // Vector biométrico recibido
    const rawVector = descriptor || datos_biometricos;
    const parsedVector = parseDescriptor(rawVector);

    if (!parsedVector || parsedVector.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Vector biométrico inválido o ausente. Se requiere un arreglo de 128 números flotantes.',
        },
        { status: 400 }
      );
    }

    const cleanDoc = documento ? String(documento).trim() : '';

    if (!cleanDoc && !empleado_id) {
      return NextResponse.json(
        {
          success: false,
          message: 'Se requiere el número de documento (DNI) o el ID del empleado.',
        },
        { status: 400 }
      );
    }

    // 1. Buscar si el empleado ya existe por ID o Documento
    let existingEmployee: Empleado | null = null;

    if (isSupabaseConfigured) {
      if (empleado_id) {
        const { data } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('id', empleado_id)
          .maybeSingle();
        if (data) existingEmployee = data as Empleado;
      }

      if (!existingEmployee && cleanDoc) {
        const { data } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('documento', cleanDoc)
          .maybeSingle();
        if (data) existingEmployee = data as Empleado;
      }
    } else {
      if (empleado_id) {
        const all = await EmpleadosService.getAll();
        existingEmployee = all.find((e) => e.id === empleado_id) || null;
      }
      if (!existingEmployee && cleanDoc) {
        existingEmployee = await EmpleadosService.getByDocumento(cleanDoc);
      }
    }

    let savedEmployee: Empleado;

    // 2. Si el empleado ya existe, actualizamos sus datos biométricos y cambiamos estado a 'Activo'
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

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('empleados')
          .update(updates)
          .eq('id', existingEmployee.id)
          .select('*, turno:turnos(*)')
          .single();

        if (error) {
          throw new Error(`Error al actualizar empleado en Supabase: ${error.message}`);
        }
        savedEmployee = data as Empleado;
      } else {
        await EmpleadosService.update(existingEmployee.id, updates);
        savedEmployee = { ...existingEmployee, ...updates };
      }

      return NextResponse.json({
        success: true,
        message: 'Patrón biométrico guardado exitosamente en Supabase. Empleado activado.',
        empleado: savedEmployee,
      });
    }

    // 3. Si el empleado no existe, lo creamos con estado 'Activo' y su vector biométrico
    const newEmployeeData = {
      documento: cleanDoc,
      nombre_completo: (nombre_completo && String(nombre_completo).trim()) || `Empleado ${cleanDoc}`,
      turno_id: turno_id || null,
      estado: 'Activo' as const,
      datos_biometricos: parsedVector,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('empleados')
        .insert([newEmployeeData])
        .select('*, turno:turnos(*)')
        .single();

      if (error) {
        throw new Error(`Error al insertar empleado en Supabase: ${error.message}`);
      }
      savedEmployee = data as Empleado;
    } else {
      savedEmployee = await EmpleadosService.create(newEmployeeData);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Nuevo empleado creado y enrolado permanentemente en Supabase.',
        empleado: savedEmployee,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error en /api/empleados/enrolar:', error);
    const message = error instanceof Error ? error.message : 'Error interno al enrolar empleado.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
