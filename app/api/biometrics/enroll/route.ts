import { NextRequest, NextResponse } from 'next/server';
import { encryptBiometrics } from '@/lib/cryptoBiometrics';
import { EmpleadosService } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empleado_id, documento, descriptor } = body;

    if ((!empleado_id && !documento) || !descriptor || !Array.isArray(descriptor)) {
      return NextResponse.json(
        { success: false, message: 'Faltan parámetros requeridos (empleado_id o documento, descriptor).' },
        { status: 400 }
      );
    }

    // Buscar al empleado
    let empleado = null;
    if (empleado_id) {
      const all = await EmpleadosService.getAll();
      empleado = all.find((e) => e.id === empleado_id) || null;
    } else if (documento) {
      empleado = await EmpleadosService.getByDocumento(documento);
    }

    if (!empleado) {
      return NextResponse.json(
        { success: false, message: 'Empleado no encontrado en el sistema.' },
        { status: 404 }
      );
    }

    // Encriptar el descriptor facial con AES-256-GCM
    const encryptedBiometrics = encryptBiometrics(descriptor);

    // Guardar en la base de datos y cambiar el estado del empleado a 'Activo'
    await EmpleadosService.update(empleado.id, {
      datos_biometricos: encryptedBiometrics,
      estado: 'Activo',
    });

    return NextResponse.json({
      success: true,
      message: 'Patrón biométrico facial encriptado con AES-256 y guardado exitosamente.',
      empleado_id: empleado.id,
      nombre_completo: empleado.nombre_completo,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno al registrar biometría.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
