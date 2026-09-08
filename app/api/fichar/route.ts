import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
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

    // 1. Obtener al empleado de Supabase en la nube
    const { data: empData, error: empError } = await supabase
      .from('empleados')
      .select('*, turno:turnos(*)')
      .eq('documento', cleanDoc)
      .maybeSingle();

    if (empError) {
      console.error('[POST /api/fichar] Error consultando empleado en Supabase:', empError.message);
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'database_error',
          message: `Error al consultar empleado en Supabase: ${empError.message}`,
        },
        { status: 500 }
      );
    }

    if (!empData) {
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

    const empleado = empData as Empleado;

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

    // 3. Verificar si cuenta con biometría registrada (Enrolamiento inicial pendiente)
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

    // 4. Si el empleado es Activo, verificar descriptor en vivo
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

    // 5. Decodificar vector guardado en Supabase
    const savedDescriptor = parseDescriptor(empleado.datos_biometricos);

    if (!savedDescriptor || savedDescriptor.length === 0) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'corrupted_biometrics',
          message: 'Los datos biométricos almacenados en la base de datos están dañados o vacíos.',
          empleado,
        },
        { status: 500 }
      );
    }

    // 6. Comparar descriptores mediante Distancia Euclidiana (umbral < 0.6)
    const bioResult = compareDescriptors(parsedLive, savedDescriptor, Number(threshold) || 0.6);
    const { isMatch, distance, score } = bioResult;

    // 7. Determinar si es ENTRADA o SALIDA hoy
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const { data: openData } = await supabase
      .from('asistencias')
      .select('*')
      .eq('empleado_id', empleado.id)
      .eq('fecha', todayStr)
      .is('hora_salida', null)
      .order('hora_entrada', { ascending: false })
      .limit(1)
      .maybeSingle();

    const openAttendance: Asistencia | null = (openData as Asistencia) || null;
    const tipoMarcacion: TipoMarcacion = openAttendance ? 'SALIDA' : 'ENTRADA';
    const estadoFichaje: EstadoFichaje = isMatch ? 'Normal' : 'Requiere_Aprobacion';

    // Subida de foto de excepción si hubo discrepancia
    let fotoUrl: string | null = foto_excepcion || null;
    if (!isMatch && foto_excepcion && foto_excepcion.startsWith('data:image')) {
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
        console.warn('No se pudo subir foto de excepción a Storage:', err);
      }
    }

    let savedAsistencia: Asistencia;

    // 8. Persistir en la tabla asistencias de Supabase
    if (tipoMarcacion === 'SALIDA' && openAttendance) {
      // Registrar SALIDA
      const horaEntrada = new Date(openAttendance.hora_entrada);
      const diffMs = Math.max(0, now.getTime() - horaEntrada.getTime());
      const diffHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

      let horasExtras = 0;
      if (empleado.turno && diffHours > 8) {
        const extra = diffHours - 8;
        horasExtras = Number(Math.min(extra, empleado.turno.max_horas_extras || 2).toFixed(2));
      }

      const updates = {
        hora_salida: now.toISOString(),
        horas_trabajadas: diffHours,
        horas_extras: horasExtras,
        estado_fichaje: isMatch ? openAttendance.estado_fichaje : 'Requiere_Aprobacion',
        foto_excepcion: fotoUrl || openAttendance.foto_excepcion,
      };

      const { data, error } = await supabase
        .from('asistencias')
        .update(updates)
        .eq('id', openAttendance.id)
        .select('*, empleado:empleados(*)')
        .single();

      if (error) {
        throw new Error(`Error al registrar salida en Supabase: ${error.message}`);
      }
      savedAsistencia = data as Asistencia;
    } else {
      // Registrar ENTRADA
      const insertData = {
        empleado_id: empleado.id,
        fecha: todayStr,
        hora_entrada: now.toISOString(),
        hora_salida: null,
        estado_fichaje: estadoFichaje,
        foto_excepcion: fotoUrl,
        horas_trabajadas: null,
        horas_extras: null,
      };

      const { data, error } = await supabase
        .from('asistencias')
        .insert([insertData])
        .select('*, empleado:empleados(*)')
        .single();

      if (error) {
        throw new Error(`Error al registrar entrada en Supabase: ${error.message}`);
      }
      savedAsistencia = data as Asistencia;
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
