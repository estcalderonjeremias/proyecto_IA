import { NextRequest, NextResponse } from 'next/server';
import { parseDescriptor } from '@/lib/biometrics';
import { isSupabaseConfigured, supabase, EmpleadosService, LocalStore, TurnosService } from '@/lib/supabaseClient';
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

    // ---------------------------------------------------------------
    // Si Supabase ESTÁ configurado: operamos directo en la BD
    // ---------------------------------------------------------------
    if (isSupabaseConfigured) {
      let existingEmployee: Empleado | null = null;

      if (empleado_id) {
        const { data, error } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('id', empleado_id)
          .maybeSingle();
        if (!error && data) existingEmployee = data as Empleado;
      }

      if (!existingEmployee && cleanDoc) {
        const { data, error } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('documento', cleanDoc)
          .maybeSingle();
        if (!error && data) existingEmployee = data as Empleado;
      }

      if (existingEmployee) {
        const updates: Partial<Empleado> = {
          datos_biometricos: parsedVector,
          estado: 'Activo',
        };
        if (nombre_completo && String(nombre_completo).trim()) {
          updates.nombre_completo = String(nombre_completo).trim();
        }
        if (turno_id !== undefined) updates.turno_id = turno_id || null;

        const { data, error } = await supabase
          .from('empleados')
          .update(updates)
          .eq('id', existingEmployee.id)
          .select('*, turno:turnos(*)')
          .single();

        if (error) {
          return NextResponse.json(
            { success: false, message: `Error Supabase al actualizar: ${error.message}` },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: `Enrolamiento completado para ${(data as Empleado).nombre_completo}. Estado: Activo.`,
          empleado: data,
        });
      }

      // Crear empleado nuevo en Supabase
      const { data, error } = await supabase
        .from('empleados')
        .insert([{
          documento: cleanDoc,
          nombre_completo: (nombre_completo && String(nombre_completo).trim()) || `Empleado DNI ${cleanDoc}`,
          turno_id: turno_id || null,
          estado: 'Activo',
          datos_biometricos: parsedVector,
        }])
        .select('*, turno:turnos(*)')
        .single();

      if (error) {
        return NextResponse.json(
          { success: false, message: `Error Supabase al insertar: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: true, message: `Nuevo empleado registrado y enrolado. Estado: Activo.`, empleado: data },
        { status: 201 }
      );
    }

    // ---------------------------------------------------------------
    // MODO LOCAL (Supabase no configurado): operamos sobre LocalStore
    // ---------------------------------------------------------------
    let existingLocal: Empleado | null = null;

    if (empleado_id) {
      existingLocal = LocalStore.getEmpleados().find(e => e.id === empleado_id) || null;
    }
    if (!existingLocal && cleanDoc) {
      existingLocal = LocalStore.getEmpleados().find(e => e.documento === cleanDoc) || null;
    }

    if (existingLocal) {
      const updated: Empleado = {
        ...existingLocal,
        datos_biometricos: parsedVector,
        estado: 'Activo',
        ...(nombre_completo && String(nombre_completo).trim()
          ? { nombre_completo: String(nombre_completo).trim() }
          : {}),
        ...(turno_id !== undefined ? { turno_id: turno_id || null } : {}),
      };
      LocalStore.saveEmpleado(updated);

      // Enriquecer con turno para la respuesta
      const turnos = LocalStore.getTurnos();
      const empleadoConTurno = { ...updated, turno: turnos.find(t => t.id === updated.turno_id) };

      return NextResponse.json({
        success: true,
        message: `Enrolamiento local completado para ${updated.nombre_completo}. Estado: Activo.`,
        empleado: empleadoConTurno,
      });
    }

    // Crear empleado nuevo en LocalStore
    const newEmployee: Empleado = {
      id: crypto.randomUUID(),
      documento: cleanDoc,
      nombre_completo: (nombre_completo && String(nombre_completo).trim()) || `Empleado DNI ${cleanDoc}`,
      turno_id: turno_id || null,
      estado: 'Activo',
      datos_biometricos: parsedVector,
      created_at: new Date().toISOString(),
    };
    LocalStore.saveEmpleado(newEmployee);

    const turnos = LocalStore.getTurnos();
    const empleadoConTurno = { ...newEmployee, turno: turnos.find(t => t.id === newEmployee.turno_id) };

    return NextResponse.json(
      {
        success: true,
        message: `Nuevo empleado registrado localmente y enrolado. Estado: Activo.`,
        empleado: empleadoConTurno,
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
