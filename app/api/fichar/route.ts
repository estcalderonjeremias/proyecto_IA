import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured, EmpleadosService, AsistenciasService } from '@/lib/supabaseClient';
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

    // 1. Obtener al empleado de Supabase
    let empleado: Empleado | null = null;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('empleados')
        .select('*, turno:turnos(*)')
        .eq('documento', cleanDoc)
        .maybeSingle();

      if (!error && data) {
        empleado = data as Empleado;
      }
    } else {
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

    // 3. Verificar si cuenta con biometría registrada
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

    // 4. Decodificar vector guardado en Supabase
    const savedDescriptor = parseDescriptor(empleado.datos_biometricos);

    if (!savedDescriptor || savedDescriptor.length === 0) {
      return NextResponse.json(
        {
          success: false,
          isMatch: false,
          reason: 'corrupted_biometrics',
          message: 'Los datos biométricos almacenados en la base de datos están dañados.',
          empleado,
        },
        { status: 500 }
      );
    }

    // 5. Comparar descriptores mediante Distancia Euclidiana (umbral < 0.6)
    const bioResult = compareDescriptors(parsedLive, savedDescriptor, Number(threshold) || 0.6);
    const { isMatch, distance, score } = bioResult;

    // 6. Determinar si es ENTRADA o SALIDA hoy
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let openAttendance: Asistencia | null = null;

    if (isSupabaseConfigured) {
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
    } else {
      const allToday = AsistenciasService;
      const todayRecord = await allToday.getTodayForEmpleado(empleado.id);
      if (todayRecord && !todayRecord.hora_salida) {
        openAttendance = todayRecord;
      }
    }

    const tipoMarcacion: TipoMarcacion = openAttendance ? 'SALIDA' : 'ENTRADA';
    const estadoFichaje: EstadoFichaje = isMatch ? 'Normal' : 'Requiere_Aprobacion';

    // Subida de foto de excepción si hubo discrepancia y se adjuntó imagen
    let fotoUrl: string | null = foto_excepcion || null;
    if (!isMatch && foto_excepcion && foto_excepcion.startsWith('data:image')) {
      try {
        fotoUrl = await AsistenciasService.uploadExceptionPhoto(foto_excepcion, empleado.id);
      } catch (err) {
        console.warn('No se pudo subir foto de excepción a Storage:', err);
      }
    }

    let savedAsistencia: Asistencia;

    // 7. Persistir en la tabla asistencias de Supabase
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
        // Si ya requería aprobación o falló la salida, mantener Requiere_Aprobacion
        estado_fichaje: isMatch ? openAttendance.estado_fichaje : 'Requiere_Aprobacion',
        foto_excepcion: fotoUrl || openAttendance.foto_excepcion,
      };

      if (isSupabaseConfigured) {
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
        savedAsistencia = await AsistenciasService.clockOut(openAttendance.id, empleado.turno || null);
      }
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

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('asistencias')
          .insert([insertData])
          .select('*, empleado:empleados(*)')
          .single();

        if (error) {
          throw new Error(`Error al registrar entrada en Supabase: ${error.message}`);
        }
        savedAsistencia = data as Asistencia;
      } else {
        savedAsistencia = await AsistenciasService.clockIn(empleado.id, estadoFichaje, fotoUrl);
      }
    }

    const message = isMatch
      ? `Marcación de ${tipoMarcacion} registrada correctamente. Identidad confirmada (Distancia: ${distance}).`
      : `¡ALERTA! Rasgos faciales no coinciden (Distancia: ${distance} >= ${threshold}). Fichaje de ${tipoMarcacion} registrado bajo revisión.`;

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
