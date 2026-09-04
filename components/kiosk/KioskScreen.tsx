'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

const KioskScanner = dynamic(
  () => import('@/components/KioskScanner').then((m) => m.KioskScanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[4/3] max-h-[460px] rounded-3xl glass-card-glow border border-white/10 flex items-center justify-center text-text-muted text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-neon-green animate-pulse" />
          <span>Iniciando sensor biométrico...</span>
        </div>
      </div>
    ),
  }
);
import { NumpadPad } from './NumpadPad';
import { OnboardingModal } from './OnboardingModal';
import { Empleado, Asistencia, TipoMarcacion } from '@/types/database';
import { EmpleadosService, AsistenciasService } from '@/lib/supabaseClient';
import { BiometricEngine, parseDescriptor } from '@/lib/biometrics';
import { sounds } from '@/lib/sound';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  User, 
  ShieldCheck,
  Maximize2,
  Minimize2,
  Sparkles,
  Camera
} from 'lucide-react';
import confetti from 'canvas-confetti';

type KioskVisualState = 'idle' | 'scanning' | 'success' | 'exception' | 'error' | 'onboarding';

export const KioskScreen: React.FC = () => {
  const [documento, setDocumento] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  const [visualState, setVisualState] = useState<KioskVisualState>('idle');
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Esperando ingreso de DNI...');
  
  // Ref para guardar el descriptor en tiempo real de face-api
  const latestLiveDescriptorRef = useRef<number[] | null>(null);

  // Feedback Data
  const [feedbackData, setFeedbackData] = useState<{
    title: string;
    description: string;
    empleado?: Empleado;
    tipoMarcacion?: TipoMarcacion;
    horasTrabajadas?: number | null;
    snapshotUrl?: string | null;
  } | null>(null);

  const [enrollingEmpleado, setEnrollingEmpleado] = useState<Empleado | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const autoResetTimer = useRef<number | null>(null);

  // Reloj Digital en Tiempo Real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCurrentDate(now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setVideoElement(video);
  }, []);

  const handleDescriptorExtracted = useCallback((descriptor: number[]) => {
    latestLiveDescriptorRef.current = descriptor;
  }, []);

  // HTML5 Fullscreen API
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const scheduleReset = (delayMs = 4500) => {
    if (autoResetTimer.current) clearTimeout(autoResetTimer.current);
    autoResetTimer.current = window.setTimeout(() => {
      setDocumento('');
      setVisualState('idle');
      setFeedbackData(null);
      setMatchScore(null);
      setStatusMessage('Esperando ingreso de DNI...');
    }, delayMs);
  };

  // Procesar marcación de asistencia con verificación biométrica vía /api/fichar
  const handleFichar = async () => {
    const cleanDoc = documento.trim();
    if (!cleanDoc) return;

    setVisualState('scanning');
    setStatusMessage('Verificando biometría facial en Supabase...');

    try {
      // 1. Obtener descriptor en vivo (extraído de face-api o canvas)
      let liveDescriptor = latestLiveDescriptorRef.current;
      if (!liveDescriptor && videoElement) {
        liveDescriptor = BiometricEngine.extractDescriptorFromVideo(videoElement);
      }

      // Snapshot para excepciones
      let snapshotBase64: string | null = null;
      if (videoElement) {
        snapshotBase64 = BiometricEngine.captureSnapshot(videoElement);
      }

      // 2. Llamada directa al endpoint unificado /api/fichar
      try {
        const apiRes = await fetch('/api/fichar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documento: cleanDoc,
            descriptor: liveDescriptor,
            foto_excepcion: snapshotBase64,
          }),
        });

        const data = await apiRes.json();

        // Empleado no encontrado
        if (apiRes.status === 404) {
          sounds.playError();
          setVisualState('error');
          setFeedbackData({
            title: 'Empleado No Encontrado',
            description: data.message || `No se encontró ningún registro para el DNI: ${cleanDoc}`,
          });
          scheduleReset(3500);
          return;
        }

        // Empleado inactivo
        if (apiRes.status === 403) {
          sounds.playError();
          setVisualState('error');
          setFeedbackData({
            title: 'Acceso Denegado (Inactivo)',
            description: data.message || 'Tu cuenta está inactiva en el sistema.',
            empleado: data.empleado,
          });
          scheduleReset(3500);
          return;
        }

        // Pendiente de enrolamiento biométrico
        if (apiRes.status === 422 || data.reason === 'pending_biometrics') {
          const emp = data.empleado || (await EmpleadosService.getByDocumento(cleanDoc));
          if (emp) {
            setVisualState('onboarding');
            setEnrollingEmpleado(emp);
            return;
          }
        }

        if (apiRes.ok && data.success) {
          setMatchScore(data.matchScore);

          if (data.isMatch) {
            // Marcación Exitosa (Verde)
            sounds.playSuccess();
            confetti({
              particleCount: 65,
              spread: 75,
              origin: { y: 0.7 },
            });

            setVisualState('success');
            setFeedbackData({
              title: data.tipo_marcacion === 'SALIDA' ? '¡Hasta luego!' : '¡Bienvenido/a!',
              description: data.tipo_marcacion === 'SALIDA'
                ? 'Marcación de SALIDA validada y persistida en Supabase.'
                : 'Marcación de ENTRADA validada y persistida en Supabase.',
              empleado: data.empleado,
              tipoMarcacion: data.tipo_marcacion,
              horasTrabajadas: data.asistencia?.horas_trabajadas,
            });
            scheduleReset(4200);
            return;
          } else {
            // Excepción por Rostro No Reconocido (Amarillo/Alerta)
            sounds.playWarning();
            setVisualState('exception');
            setFeedbackData({
              title: 'Rostro No Coincide',
              description: `¡Atención! Discrepancia biométrica con el titular del DNI (${data.empleado?.nombre_completo}). Marcación de ${data.tipo_marcacion} enviada a revisión.`,
              empleado: data.empleado,
              tipoMarcacion: data.tipo_marcacion,
              horasTrabajadas: data.asistencia?.horas_trabajadas,
              snapshotUrl: snapshotBase64,
            });
            scheduleReset(6000);
            return;
          }
        }
      } catch (networkErr) {
        console.warn('Fallo llamada API /api/fichar, intentando fallback:', networkErr);
      }

      // 3. Fallback local si la llamada de red falló
      const empleado = await EmpleadosService.getByDocumento(cleanDoc);

      if (!empleado) {
        sounds.playError();
        setVisualState('error');
        setFeedbackData({
          title: 'Empleado No Encontrado',
          description: `No se encontró ningún registro para el DNI: ${cleanDoc}`,
        });
        scheduleReset(3500);
        return;
      }

      if (empleado.estado === 'Inactivo') {
        sounds.playError();
        setVisualState('error');
        setFeedbackData({
          title: 'Acceso Denegado (Inactivo)',
          description: 'Tu cuenta está inactiva en el sistema.',
          empleado,
        });
        scheduleReset(3500);
        return;
      }

      if (empleado.estado === 'Pendiente_Biometria' || !empleado.datos_biometricos) {
        setVisualState('onboarding');
        setEnrollingEmpleado(empleado);
        return;
      }

      const savedDesc = parseDescriptor(empleado.datos_biometricos);
      let isMatch = false;
      let scoreVal = 0;

      if (liveDescriptor && savedDesc) {
        const bioResult = BiometricEngine.compareDescriptors(liveDescriptor, savedDesc, 0.6);
        isMatch = bioResult.isMatch || bioResult.success;
        scoreVal = bioResult.score;
      }

      setMatchScore(scoreVal);
      const asistenciaHoy = await AsistenciasService.getTodayForEmpleado(empleado.id);
      const isExit = Boolean(asistenciaHoy && !asistenciaHoy.hora_salida);

      if (isMatch) {
        sounds.playSuccess();
        confetti({ particleCount: 65, spread: 75, origin: { y: 0.7 } });
        let savedAsistencia: Asistencia;
        if (isExit && asistenciaHoy) {
          savedAsistencia = await AsistenciasService.clockOut(asistenciaHoy.id, empleado.turno || null);
        } else {
          savedAsistencia = await AsistenciasService.clockIn(empleado.id, 'Normal');
        }
        setVisualState('success');
        setFeedbackData({
          title: isExit ? '¡Hasta luego!' : '¡Bienvenido/a!',
          description: isExit ? 'Marcación de SALIDA registrada.' : 'Marcación de ENTRADA registrada.',
          empleado,
          tipoMarcacion: isExit ? 'SALIDA' : 'ENTRADA',
          horasTrabajadas: savedAsistencia.horas_trabajadas,
        });
        scheduleReset(4200);
      } else {
        sounds.playWarning();
        let fotoUrl: string | null = null;
        if (snapshotBase64) {
          fotoUrl = await AsistenciasService.uploadExceptionPhoto(snapshotBase64, empleado.id);
        }
        let savedAsistencia: Asistencia;
        if (isExit && asistenciaHoy) {
          savedAsistencia = await AsistenciasService.clockOut(asistenciaHoy.id, empleado.turno || null);
        } else {
          savedAsistencia = await AsistenciasService.clockIn(empleado.id, 'Requiere_Aprobacion', fotoUrl);
        }
        setVisualState('exception');
        setFeedbackData({
          title: 'Rostro No Coincide',
          description: `Discrepancia facial detectada para ${empleado.nombre_completo}.`,
          empleado,
          tipoMarcacion: isExit ? 'SALIDA' : 'ENTRADA',
          horasTrabajadas: savedAsistencia.horas_trabajadas,
          snapshotUrl: fotoUrl,
        });
        scheduleReset(6000);
      }
    } catch (err: unknown) {
      sounds.playError();
      setVisualState('error');
      setFeedbackData({
        title: 'Error de Fichaje',
        description: err instanceof Error ? err.message : 'Error inesperado durante la marcación.',
      });
      scheduleReset(4000);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-70px)] flex flex-col items-center justify-center p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Botón Pantalla Completa Web */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface/80 hover:bg-surface border border-white/10 text-xs font-semibold text-text-muted hover:text-text-main transition-all z-10"
        title="Modo Kiosco Pantalla Completa"
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        {isFullscreen ? 'Salir' : 'Pantalla Completa'}
      </button>

      {/* Header Central con Reloj Digital */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 text-neon-green text-xs sm:text-sm font-bold tracking-widest uppercase mb-1.5 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]">
          <ShieldCheck size={18} />
          Terminal Kiosco Biométrico
        </div>
        <div className="font-mono text-4xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-[0_0_20px_rgba(34,197,94,0.3)]">
          {currentTime || '--:--:--'}
        </div>
        <div className="text-text-muted text-sm sm:text-base capitalize mt-1">
          {currentDate}
        </div>
      </div>

      {/* Contenedor Principal: Webcam + Numpad */}
      <div className="glass-card w-full max-w-4xl p-6 sm:p-10 rounded-3xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative overflow-hidden">
        {/* Lado Izquierdo: Sensor Biométrico KioskScanner (@vladmandic/face-api + Camo) */}
        <div className="flex flex-col items-center gap-3">
          <KioskScanner
            onVideoReady={handleVideoReady}
            onDescriptorExtracted={handleDescriptorExtracted}
            isScanning={visualState === 'scanning' || documento.length > 0}
            statusText={statusMessage}
            matchScore={matchScore}
          />
          <p className="text-text-dim text-xs text-center">
            Párate frente a la cámara e ingresa tu DNI para fichar
          </p>
        </div>

        {/* Lado Derecho: Teclado Numérico */}
        <div className="flex flex-col items-center justify-center">
          <NumpadPad
            value={documento}
            onChange={setDocumento}
            onSubmit={handleFichar}
            disabled={visualState === 'scanning'}
          />
        </div>

        {/* TARJETAS DE ESTADO VISUAL SUPERPUESTAS */}
        {(visualState === 'success' || visualState === 'exception' || visualState === 'error') && feedbackData && (
          <div className="absolute inset-0 bg-[#0B0F17]/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center z-30 animate-in fade-in zoom-in-95 duration-200">
            {/* Estado Éxito (Verde) */}
            {visualState === 'success' && (
              <div className="w-20 h-20 rounded-full bg-status-success/20 border-2 border-status-success flex items-center justify-center text-status-success mb-4 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                <CheckCircle size={48} />
              </div>
            )}

            {/* Estado Excepción (Amarillo) */}
            {visualState === 'exception' && (
              <div className="w-20 h-20 rounded-full bg-status-warning/20 border-2 border-status-warning flex items-center justify-center text-status-warning mb-4 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                <AlertTriangle size={48} />
              </div>
            )}

            {/* Estado Error / Rechazo (Rojo) */}
            {visualState === 'error' && (
              <div className="w-20 h-20 rounded-full bg-status-error/20 border-2 border-status-error flex items-center justify-center text-status-error mb-4 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                <XCircle size={48} />
              </div>
            )}

            <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-white">
              {feedbackData.title}
            </h2>

            {feedbackData.empleado && (
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 my-2 text-sm sm:text-base">
                <User size={18} className="text-neon-green" />
                <span className="font-semibold text-text-main">{feedbackData.empleado.nombre_completo}</span>
                {feedbackData.tipoMarcacion && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      feedbackData.tipoMarcacion === 'ENTRADA'
                        ? 'bg-neon-emerald/20 text-neon-green border border-neon-green/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                    }`}
                  >
                    {feedbackData.tipoMarcacion}
                  </span>
                )}
              </div>
            )}

            <p className="text-text-muted text-sm sm:text-base max-w-md my-2 leading-relaxed">
              {feedbackData.description}
            </p>

            {feedbackData.horasTrabajadas != null && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 text-neon-green text-xs font-mono mt-1">
                <Clock size={14} /> Total Jornada: {feedbackData.horasTrabajadas} hs
              </div>
            )}

            {feedbackData.snapshotUrl && (
              <div className="flex items-center gap-2 mt-3 text-xs text-text-dim">
                <Camera size={14} /> Foto de seguridad respaldada en Supabase Storage
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setVisualState('idle');
                setDocumento('');
              }}
              className="mt-6 px-6 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-white/10 text-xs font-semibold text-text-main transition-colors"
            >
              Listo
            </button>
          </div>
        )}
      </div>

      {/* Modal de Onboarding / Primer Registro de Rostro */}
      {visualState === 'onboarding' && enrollingEmpleado && (
        <OnboardingModal
          empleado={enrollingEmpleado}
          videoElement={videoElement}
          onClose={() => {
            setVisualState('idle');
            setEnrollingEmpleado(null);
          }}
          onSuccess={() => {
            setEnrollingEmpleado(null);
            setVisualState('idle');
            handleFichar();
          }}
        />
      )}
    </div>
  );
};
