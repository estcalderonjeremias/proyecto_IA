import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase, EmpleadosService, AsistenciasService, LocalStore } from '@/lib/supabaseClient';
import { compareDescriptors, parseDescriptor } from '@/lib/biometrics';
import { Empleado, Asistencia, TipoMarcacion, EstadoFichaje } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      documento,
      dni,
      descriptor,
      liveDescriptor,
      scannedVector,
      foto_excepcion,
      threshold = 0.6,
    } = body;

    const rawDoc = documento || dni;
    const cleanDoc = rawDoc ? String(rawDoc).trim() : '';

    if (!cleanDoc) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'missing_documento',
          message: 'El número de documento (DNI) es requerido.',
        },
        { status: 400 }
      );
    }

    // 1. Obtener al empleado (con fallback local si Supabase no está configurado)
    let empleado: Empleado | null = null;

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('empleados')
          .select('*, turno:turnos(*)')
          .eq('documento', cleanDoc)
          .maybeSingle();

        if (error) {
          console.warn('[POST /api/fichar] Error Supabase, usando fallback local:', error.message);
        } else if (data) {
          empleado = data as Empleado;
        }
      } catch (err) {
        console.warn('[POST /api/fichar] Conexión Supabase falló, usando local:', err);
      }
    }

    // Fallback local si Supabase no entregó el empleado
    if (!empleado) {
      empleado = await EmpleadosService.getByDocumento(cleanDoc);
    }

    if (!empleado) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'not_found',
          message: `No se encontró ningún empleado registrado con el DNI: ${cleanDoc}`,
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
          message: 'El empleado se encuentra inactivo en el sistema. Contacta a Recursos Humanos.',
          empleado,
        },
        { status: 403 }
      );
    }

    // 3. Verificar biometría registrada
    if (empleado.estado === 'Pendiente_Biometria' || !empleado.datos_biometricos) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'pending_biometrics',
          message: 'El empleado tiene pendiente el enrolamiento biométrico facial.',
          empleado,
        },
        { status: 422 }
      );
    }

    // 4. Verificar descriptor en vivo
    const rawLive = descriptor || liveDescriptor || scannedVector;
    const parsedLive = parseDescriptor(rawLive);

    if (!parsedLive || parsedLive.length === 0) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'missing_descriptor',
          message: 'No se recibió el vector biométrico escaneado desde la cámara.',
        },
        { status: 400 }
      );
    }

    // 5. Decodificar vector guardado
    const savedDescriptor = parseDescriptor(empleado.datos_biometricos);

    if (!savedDescriptor || savedDescriptor.length === 0) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'corrupted_biometrics',
          message: 'Los datos biométricos almacenados están dañados o vacíos.',
          empleado,
        },
        { status: 500 }
      );
    }

    // 6. Comparar descriptores
    const bioResult = compareDescriptors(parsedLive, savedDescriptor, Number(threshold) || 0.6);
    const { isMatch, distance, score } = bioResult;

    // 7. Determinar ENTRADA o SALIDA
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const estadoFichaje: EstadoFichaje = isMatch ? 'Normal' : 'Requiere_Aprobacion';

    // Buscar asistencia abierta de hoy
    let openAttendance: Asistencia | null = null;

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from('asistencias')
          .select('*')
          .eq('empleado_id', empleado.id)
          .eq('fecha', todayStr)
          .is('hora_salida', null)
          .order('hora_entrada', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) openAttendance = data as Asistencia;
      } catch (err) {
        console.warn('[fichar] Error buscando asistencia abierta en Supabase:', err);
      }
    }

    // Fallback local
    if (!openAttendance) {
      const localRecords = LocalStore.getAsistencias();
      openAttendance = localRecords.find(
        a => a.empleado_id === empleado!.id && a.fecha === todayStr && !a.hora_salida
      ) || null;
    }

    const tipoMarcacion: TipoMarcacion = openAttendance ? 'SALIDA' : 'ENTRADA';

    // 8. Subida de foto de excepción (solo si Supabase configurado)
    let fotoUrl: string | null = foto_excepcion || null;
    if (!isMatch && foto_excepcion && foto_excepcion.startsWith('data:image') && isSupabaseConfigured) {
      try {
        const filename = `excepcion_${empleado.id}_${Date.now()}.jpg`;
        const base64Data = foto_excepcion.split(',')[1] || foto_excepcion;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('fotos_excepciones')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });

        if (!uploadErr && uploadData) {
          const { data: pubUrl } = supabase.storage
            .from('fotos_excepciones')
            .getPublicUrl(uploadData.path);
          fotoUrl = pubUrl.publicUrl;
        }
      } catch (err) {
        console.warn('[fichar] No se pudo subir foto de excepción:', err);
      }
    }

    // 9. Persistir asistencia
    let savedAsistencia: Asistencia;

    if (tipoMarcacion === 'SALIDA' && openAttendance) {
      // Registrar SALIDA
      const turnoEmpleado = (empleado as Empleado & { turno?: { max_horas_extras?: number } }).turno;
      savedAsistencia = await AsistenciasService.clockOut(
        openAttendance.id,
        turnoEmpleado || null
      );
    } else {
      // Registrar ENTRADA
      savedAsistencia = await AsistenciasService.clockIn(empleado.id, estadoFichaje, fotoUrl);
    }

    const message = isMatch
      ? `Marcación de ${tipoMarcacion} registrada correctamente. Identidad confirmada.`
      : `¡ALERTA! Rasgos faciales no coinciden. Fichaje de ${tipoMarcacion} registrado bajo revisión.`;

    return NextResponse.json({
      success: true,
      isMatch,
      tipo_marcacion: tipoMarcacion,
      distance,
      threshold,
      matchScore: score,
      message,
      empleado,
      asistencia: savedAsistencia,
    });

  } catch (error: unknown) {
    console.error('Error en /api/fichar:', error);
    const message = error instanceof Error ? error.message : 'Error interno durante el fichaje biométrico.';
    return NextResponse.json({ success: false, isMatch: false, message }, { status: 500 });
  }
}
