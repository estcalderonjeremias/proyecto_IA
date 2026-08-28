'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebcamScanner } from './WebcamScanner';
import { NumpadPad } from './NumpadPad';
import { OnboardingModal } from './OnboardingModal';
import { Empleado, Asistencia, TipoMarcacion } from '@/types/database';
import { EmpleadosService, AsistenciasService } from '@/lib/supabaseClient';
import { BiometricEngine } from '@/lib/biometrics';
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

  // Procesar marcación de asistencia
  const handleFichar = async () => {
    const cleanDoc = documento.trim();
    if (!cleanDoc) return;

    setVisualState('scanning');
    setStatusMessage('Buscando empleado y analizando biometría...');

    try {
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
          description: 'Tu cuenta está inactiva en el sistema. Contacta con Recursos Humanos.',
          empleado,
        });
        scheduleReset(3500);
        return;
      }

      // Si está pendiente de biometría -> Onboarding
      if (empleado.estado === 'Pendiente_Biometria' || !empleado.datos_biometricos) {
        setVisualState('onboarding');
        setEnrollingEmpleado(empleado);
        return;
      }

      // Verificación biométrica
      let isBiometricMatch = false;
      let scoreVal = 0;

      if (videoElement) {
        const liveDescriptor = BiometricEngine.extractDescriptorFromVideo(videoElement);
        if (liveDescriptor && empleado.datos_biometricos) {
          try {
            const savedDescriptor: number[] = JSON.parse(empleado.datos_biometricos);
            const bioResult = BiometricEngine.compareDescriptors(liveDescriptor, savedDescriptor);
            isBiometricMatch = bioResult.success;
            scoreVal = bioResult.score;
            setMatchScore(scoreVal);
          } catch {
            isBiometricMatch = false;
          }
        }
      }

      // Verificar si ya tiene marcación de hoy
      const asistenciaHoy = await AsistenciasService.getTodayForEmpleado(empleado.id);
      const isExit = Boolean(asistenciaHoy && !asistenciaHoy.hora_salida);

      if (isBiometricMatch) {
        // Marcación Exitosa (Verde)
        sounds.playSuccess();
        confetti({
          particleCount: 65,
          spread: 75,
          origin: { y: 0.7 },
        });

        let savedAsistencia: Asistencia;
        if (isExit && asistenciaHoy) {
          savedAsistencia = await AsistenciasService.clockOut(asistenciaHoy.id, empleado.turno || null);
        } else {
          savedAsistencia = await AsistenciasService.clockIn(empleado.id, 'Normal');
        }

        setVisualState('success');
        setFeedbackData({
          title: isExit ? '¡Hasta luego!' : '¡Bienvenido/a!',
          description: isExit
            ? 'Marcación de SALIDA validada y registrada correctamente.'
            : 'Marcación de ENTRADA validada y registrada correctamente.',
          empleado,
          tipoMarcacion: isExit ? 'SALIDA' : 'ENTRADA',
          horasTrabajadas: savedAsistencia.horas_trabajadas,
        });
        scheduleReset(4200);
      } else {
        // Excepción por Falla Biometría (Amarillo)
        sounds.playWarning();
        let fotoUrl: string | null = null;
        if (videoElement) {
          const snapshotBase64 = BiometricEngine.captureSnapshot(videoElement);
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
          title: 'Fichaje en Revisión',
          description: 'Rostro no reconocido con suficiente precisión. Tomando foto de seguridad para aprobación del Administrador.',
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
        {/* Lado Izquierdo: Sensor Webcam */}
        <div className="flex flex-col items-center gap-3">
          <WebcamScanner
            onVideoReady={handleVideoReady}
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
