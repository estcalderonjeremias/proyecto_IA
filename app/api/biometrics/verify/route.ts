import { NextRequest, NextResponse } from 'next/server';
import { decryptBiometrics } from '@/lib/cryptoBiometrics';
import { BiometricEngine } from '@/lib/biometrics';
import { EmpleadosService } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documento, liveDescriptor } = body;

    const cleanDoc = documento ? String(documento).trim() : '';

    if (!cleanDoc) {
      return NextResponse.json(
        { success: false, isMatch: false, reason: 'invalid_params', message: 'El número de DNI es requerido.' },
        { status: 400 }
      );
    }

    // 1. Obtener al empleado por documento
    const empleado = await EmpleadosService.getByDocumento(cleanDoc);

    if (!empleado) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'not_found',
          message: `No se encontró ningún empleado registrado para el DNI: ${cleanDoc}`,
        },
        { status: 404 }
      );
    }

    // 2. Verificar estado del empleado
    if (empleado.estado === 'Inactivo') {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'inactive',
          message: 'Tu cuenta está inactiva en el sistema. Contacta a Recursos Humanos.',
          empleado,
        },
        { status: 403 }
      );
    }

    // 3. Verificar si tiene biometría registrada
    if (empleado.estado === 'Pendiente_Biometria' || !empleado.datos_biometricos) {
      return NextResponse.json({
        success: true,
        isMatch: false,
        reason: 'pending_biometrics',
        message: 'El empleado está pendiente de enrolamiento facial.',
        empleado,
      });
    }

    // 4. Desencriptar los datos biométricos almacenados con AES-256-GCM
    const storedDescriptor = decryptBiometrics(empleado.datos_biometricos);

    if (!storedDescriptor) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'corrupted_biometrics',
          message: 'Error al desencriptar el perfil biométrico guardado en la base de datos.',
          empleado,
        },
        { status: 500 }
      );
    }

    // 5. Si no se proporcionó un rostro en vivo (por ejemplo, si la cámara está apagada)
    if (!liveDescriptor || !Array.isArray(liveDescriptor)) {
      return NextResponse.json({
        success: true,
        isMatch: false,
        reason: 'no_live_face',
        matchScore: 0,
        message: 'No se detectó un rostro claro en vivo frente a la cámara.',
        empleado,
      });
    }

    // 6. Comparar descriptor en vivo con el descriptor desencriptado almacenado
    const bioResult = BiometricEngine.compareDescriptors(liveDescriptor, storedDescriptor);

    if (!bioResult.success) {
      // CASO ANTI-SUPLANTACIÓN: Otra persona intentó usar el DNI de este empleado
      return NextResponse.json({
        success: true,
        isMatch: false,
        reason: 'face_mismatch',
        matchScore: bioResult.score,
        message: '¡ALERTA DE SEGURIDAD! El rostro frente a la cámara NO coincide con el registro biométrico de este DNI.',
        empleado,
      });
    }

    // CASO EXITOSO: Rostro verificado y validado
    return NextResponse.json({
      success: true,
      isMatch: true,
      reason: 'matched',
      matchScore: bioResult.score,
      message: `Identidad verificada exitosamente (${Math.round(bioResult.score * 100)}% de coincidencia).`,
      empleado,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno durante la verificación biométrica.';
    return NextResponse.json({ success: false, isMatch: false, message }, { status: 500 });
  }
}
