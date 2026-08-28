import { NextRequest, NextResponse } from 'next/server';
import { EmpleadosService, AsistenciasService, isSupabaseConfigured, supabase } from '@/lib/supabaseClient';
import { verificarBiometria } from '@/lib/biometrics';
import { calcularHoras } from '@/lib/timeCalculator';
import { FicharRequestBody, FicharResponseData, EstadoFichaje } from '@/types/database';

export async function POST(req: NextRequest) {
  try {
    const body: FicharRequestBody = await req.json();
    const { documento, descriptor, esExcepcion, fotoBase64, esEnrolamiento } = body;

    // 1. Validar documento
    if (!documento || typeof documento !== 'string' || !documento.trim()) {
      return NextResponse.json<FicharResponseData>(
        { success: false, mensaje: 'El número de documento es obligatorio' },
        { status: 400 }
      );
    }

    const cleanDoc = documento.trim();

    // 2. Buscar empleado en la base de datos
    const empleado = await EmpleadosService.getByDocumento(cleanDoc);
    if (!empleado) {
      return NextResponse.json<FicharResponseData>(
        { success: false, mensaje: 'Empleado no encontrado en el sistema' },
        { status: 404 }
      );
    }

    // 3. Validar estado del empleado
    if (empleado.estado === 'Inactivo') {
      return NextResponse.json<FicharResponseData>(
        { success: false, mensaje: 'Empleado inactivo. No tiene autorización para fichar.' },
        { status: 403 }
      );
    }

    // 4. Flujo de Enrolamiento (si estado es Pendiente_Biometria)
    if (empleado.estado === 'Pendiente_Biometria') {
      if (descriptor && Array.isArray(descriptor) && descriptor.length === 128) {
        // Guardar biometría y activar empleado
        await EmpleadosService.saveBiometrics(empleado.id, descriptor);
        empleado.estado = 'Activo';
        empleado.datos_biometricos = JSON.stringify(descriptor);
      } else if (!esExcepcion) {
        return NextResponse.json<FicharResponseData>(
          {
            success: false,
            requiereEnrolamiento: true,
            mensaje: 'Empleado pendiente de enrolamiento biométrico. Mire a la cámara para registrar su rostro.',
            empleado: {
              id: empleado.id,
              documento: empleado.documento,
              nombre_completo: empleado.nombre_completo,
              estado: empleado.estado,
            },
          },
          { status: 200 }
        );
      }
    }

    // 5. Verificación Biométrica o Manejo de Excepciones
    let estadoFichaje: EstadoFichaje = 'Normal';
    let fotoUrl: string | null = null;

    if (esExcepcion) {
      // Excepción forzada por el cliente (falla de cámara o iluminación)
      estadoFichaje = 'Requiere_Aprobacion';
      if (fotoBase64) {
        fotoUrl = await AsistenciasService.uploadExceptionPhoto(fotoBase64, empleado.id);
      }
    } else {
      // Comparar descriptor con datos biométricos almacenados
      if (!empleado.datos_biometricos) {
        estadoFichaje = 'Requiere_Aprobacion';
        if (fotoBase64) {
          fotoUrl = await AsistenciasService.uploadExceptionPhoto(fotoBase64, empleado.id);
        }
      } else {
        const matchResult = verificarBiometria(empleado.datos_biometricos, descriptor, 0.60);

        if (!matchResult.isMatch) {
          // Si no coincide el rostro pero se envió foto de excepción
          if (fotoBase64) {
            estadoFichaje = 'Requiere_Aprobacion';
            fotoUrl = await AsistenciasService.uploadExceptionPhoto(fotoBase64, empleado.id);
          } else {
            return NextResponse.json<FicharResponseData>(
              {
                success: false,
                mensaje: `Verificación biométrica fallida: ${matchResult.message}`,
              },
              { status: 401 }
            );
          }
        }
      }
    }

    // 6. Determinar si es Entrada o Salida
    const asistenciaHoy = await AsistenciasService.getTodayForEmpleado(empleado.id);
    const now = new Date();

    if (!asistenciaHoy || asistenciaHoy.hora_salida !== null) {
      // ----------------------------------------------------
      // REGISTRAR ENTRADA (Clock-In)
      // ----------------------------------------------------
      const nuevaAsistencia = await AsistenciasService.clockIn(
        empleado.id,
        estadoFichaje,
        fotoUrl
      );

      const mensaje = estadoFichaje === 'Requiere_Aprobacion'
        ? `Entrada registrada con excepción. Requiere validación del supervisor.`
        : `¡Bienvenido/a, ${empleado.nombre_completo}! Entrada registrada correctamente.`;

      return NextResponse.json<FicharResponseData>({
        success: true,
        tipo: 'ENTRADA',
        mensaje,
        asistencia: nuevaAsistencia,
        empleado: {
          id: empleado.id,
          documento: empleado.documento,
          nombre_completo: empleado.nombre_completo,
          estado: empleado.estado,
        },
      });
    } else {
      // ----------------------------------------------------
      // REGISTRAR SALIDA (Clock-Out) y Calcular Horas
      // ----------------------------------------------------
      const calculo = calcularHoras(asistenciaHoy.hora_entrada, now, empleado.turno);

      let asistenciaActualizada;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('asistencias')
          .update({
            hora_salida: now.toISOString(),
            horas_trabajadas: calculo.horasTrabajadas,
            horas_extras: calculo.horasExtras,
          })
          .eq('id', asistenciaHoy.id)
          .select('*, empleado:empleados(*)')
          .single();

        if (error) {
          throw new Error(`Error al actualizar salida en Supabase: ${error.message}`);
        }
        asistenciaActualizada = data;
      } else {
        asistenciaActualizada = await AsistenciasService.clockOut(asistenciaHoy.id, empleado.turno || null);
      }

      const mensaje = `¡Hasta luego, ${empleado.nombre_completo}! Salida registrada. ` +
        `Horas trabajadas: ${calculo.horasTrabajadas}h` +
        (calculo.horasExtras > 0 ? ` (Extras: ${calculo.horasExtras}h)` : '');

      return NextResponse.json<FicharResponseData>({
        success: true,
        tipo: 'SALIDA',
        mensaje,
        asistencia: asistenciaActualizada,
        horasCalculadas: {
          horasTrabajadas: calculo.horasTrabajadas,
          horasExtras: calculo.horasExtras,
        },
        empleado: {
          id: empleado.id,
          documento: empleado.documento,
          nombre_completo: empleado.nombre_completo,
          estado: empleado.estado,
        },
      });
    }
  } catch (error: any) {
    console.error('Error en Route Handler /api/fichar:', error);
    return NextResponse.json<FicharResponseData>(
      {
        success: false,
        mensaje: error?.message || 'Error interno del servidor al procesar el fichaje',
      },
      { status: 500 }
    );
  }
}
