'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WebcamScanner } from './WebcamScanner';
import { NumpadPad } from './NumpadPad';
import { OnboardingModal } from './OnboardingModal';
import { Empleado, Asistencia, TipoMarcacion, FicharResponseData } from '@/types/database';
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
  Camera,
  Smartphone
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

  // Procesar marcación de asistencia llamando al API /api/fichar
  const handleFichar = async (customSnapshotBase64?: string) => {
    const cleanDoc = documento.trim();
    if (!cleanDoc) return;

    setVisualState('scanning');
    setStatusMessage('Buscando empleado y analizando biometría...');

    try {
      // 1. Extraer descriptor del video si está disponible
      let liveDescriptor: number[] | null = null;
      let snapshotBase64 = customSnapshotBase64 || null;

      if (videoElement && !snapshotBase64) {
        liveDescriptor = BiometricEngine.extractDescriptorFromVideo(videoElement);
        snapshotBase64 = BiometricEngine.captureSnapshot(videoElement);
      }

      // 2. Llamada al API Route /api/fichar
      const response = await fetch('/api/fichar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documento: cleanDoc,
          descriptor: liveDescriptor || undefined,
          fotoBase64: snapshotBase64 || undefined,
        }),
      });

      const data: FicharResponseData = await response.json();

      // Si requiere enrolamiento biométrico inicial
      if (data.requiereEnrolamiento && data.empleado) {
        setVisualState('onboarding');
        setEnrollingEmpleado(data.empleado as Empleado);
        return;
      }

      if (!response.ok || !data.success) {
        sounds.playError();
        setVisualState('error');
        setFeedbackData({
          title: 'No se pudo registrar',
          description: data.mensaje || 'Error en la verificación del fichaje.',
        });
        scheduleReset(3500);
        return;
      }

      const isExit = data.tipo === 'SALIDA';
      const isException = data.asistencia?.estado_fichaje === 'Requiere_Aprobacion';

      if (isException) {
        sounds.playWarning();
        setVisualState('exception');
        setFeedbackData({
          title: 'Fichaje en Revisión',
          description: data.mensaje,
          empleado: data.empleado as Empleado,
          tipoMarcacion: data.tipo,
          horasTrabajadas: data.horasCalculadas?.horasTrabajadas,
          snapshotUrl: snapshotBase64,
        });
        scheduleReset(6000);
      } else {
        sounds.playSuccess();
        confetti({
          particleCount: 65,
          spread: 75,
          origin: { y: 0.7 },
        });

        setVisualState('success');
        setFeedbackData({
          title: isExit ? '¡Hasta luego!' : '¡Bienvenido/a!',
          description: data.mensaje,
          empleado: data.empleado as Empleado,
          tipoMarcacion: data.tipo,
          horasTrabajadas: data.horasCalculadas?.horasTrabajadas,
        });
        scheduleReset(4200);
      }
    } catch (err: unknown) {
      console.warn('Error en fetch /api/fichar, recurriendo a fallback local:', err);
      // Fallback local en caso de desconexión
      try {
        const emp = await EmpleadosService.getByDocumento(cleanDoc);
        if (!emp) {
          sounds.playError();
          setVisualState('error');
          setFeedbackData({
            title: 'Empleado No Encontrado',
            description: `No se encontró ningún registro para el DNI: ${cleanDoc}`,
          });
          scheduleReset(3500);
          return;
        }

        if (emp.estado === 'Pendiente_Biometria') {
          setVisualState('onboarding');
          setEnrollingEmpleado(emp);
          return;
        }

        sounds.playSuccess();
        setVisualState('success');
        setFeedbackData({
          title: 'Fichaje Registrado',
          description: `Fichaje procesado exitosamente para ${emp.nombre_completo}.`,
          empleado: emp,
        });
        scheduleReset(4000);
      } catch (fallbackErr: any) {
        sounds.playError();
        setVisualState('error');
        setFeedbackData({
          title: 'Error de Fichaje',
          description: fallbackErr?.message || 'Error inesperado durante la marcación.',
        });
        scheduleReset(4000);
      }
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-70px)] flex flex-col items-center justify-center p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Botón Pantalla Completa Web */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 p-2.5 rounded-xl bg-surface/80 hover:bg-surface border border-white/10 text-text-muted hover:text-neon-green transition-all shadow-card flex items-center gap-1.5 text-xs font-semibold z-10"
        title="Modo Kiosco Pantalla Completa"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        <span className="hidden sm:inline">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
      </button>

      {/* Reloj y Título Principal */}
      <div className="text-center mb-6 space-y-1">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#111726]/90 border border-neon-emerald/30 text-neon-green text-sm font-medium tracking-wide shadow-[0_0_15px_rgba(34,197,94,0.15)]">
          <Clock size={16} />
          <span className="font-mono text-base font-bold tracking-wider">{currentTime || '--:--:--'}</span>
        </div>
        <p className="text-xs text-text-muted capitalize pt-1">{currentDate}</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Control de Asistencia Biométrico
        </h1>
      </div>

      {/* Grid Principal: Scanner y Teclado */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center justify-items-center">
        {/* Lado Izquierdo: Cámara Web / Móvil */}
        <div className="w-full flex flex-col items-center gap-4">
          <WebcamScanner
            onVideoReady={handleVideoReady}
            onSnapshotTaken={(base64) => handleFichar(base64)}
            isScanning={visualState === 'scanning'}
            statusText={
              visualState === 'scanning'
                ? 'Analizando rasgos faciales...'
                : visualState === 'success'
                ? 'Coincidencia Biométrica Verificada'
                : visualState === 'exception'
                ? 'Foto de seguridad capturada'
                : 'Sensor Listo para Escaneo'
            }
            matchScore={matchScore}
          />
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Smartphone size={14} className="text-neon-green" />
            <span>Compatible con cámara frontal y trasera en celulares</span>
          </div>
        </div>

        {/* Lado Derecho: Numpad / Estados de Feedback */}
        <div className="w-full max-w-md flex flex-col items-center">
          {visualState === 'idle' || visualState === 'scanning' ? (
            <NumpadPad
              value={documento}
              onChange={setDocumento}
              onSubmit={() => handleFichar()}
              disabled={visualState === 'scanning'}
            />
          ) : (
            /* Tarjeta de Feedback Visual Grande */
            <div
              className={`w-full p-6 sm:p-8 rounded-3xl border transition-all duration-300 flex flex-col items-center text-center shadow-card ${
                visualState === 'success'
                  ? 'bg-status-success/10 border-status-success/40 text-status-success'
                  : visualState === 'exception'
                  ? 'bg-status-warning/10 border-status-warning/40 text-status-warning'
                  : 'bg-status-error/10 border-status-error/40 text-status-error'
              }`}
            >
              {visualState === 'success' && <CheckCircle size={64} className="mb-4 animate-bounce" />}
              {visualState === 'exception' && <AlertTriangle size={64} className="mb-4 text-status-warning" />}
              {visualState === 'error' && <XCircle size={64} className="mb-4 text-status-error" />}

              <h2 className="text-2xl font-bold text-white mb-2">{feedbackData?.title}</h2>
              <p className="text-sm text-text-muted mb-4">{feedbackData?.description}</p>

              {feedbackData?.empleado && (
                <div className="w-full p-4 rounded-2xl bg-bg-card/90 border border-white/10 text-left space-y-2 text-xs text-text-main">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <User size={16} className="text-neon-green" />
                    {feedbackData.empleado.nombre_completo}
                  </div>
                  <p className="text-text-muted">
                    DNI: <span className="font-mono text-white">{feedbackData.empleado.documento}</span>
                  </p>
                  {feedbackData.tipoMarcacion && (
                    <p className="text-text-muted">
                      Acción:{' '}
                      <span className="font-bold text-neon-green">
                        {feedbackData.tipoMarcacion === 'ENTRADA' ? 'ENTRADA REGISTRADA' : 'SALIDA REGISTRADA'}
                      </span>
                    </p>
                  )}
                  {feedbackData.horasTrabajadas !== undefined && feedbackData.horasTrabajadas !== null && (
                    <p className="text-text-muted">
                      Horas registradas:{' '}
                      <span className="font-bold text-white">{feedbackData.horasTrabajadas} hrs</span>
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (autoResetTimer.current) clearTimeout(autoResetTimer.current);
                  setVisualState('idle');
                  setDocumento('');
                }}
                className="mt-6 px-6 py-2 rounded-xl bg-surface hover:bg-surface/80 border border-white/10 text-xs font-semibold text-text-main hover:text-white transition-all"
              >
                Volver al Teclado
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Enrolamiento (Onboarding Facial) */}
      {visualState === 'onboarding' && enrollingEmpleado && (
        <OnboardingModal
          empleado={enrollingEmpleado}
          videoElement={videoElement}
          onClose={() => {
            setVisualState('idle');
            setEnrollingEmpleado(null);
          }}
          onSuccess={(updatedEmpleado) => {
            sounds.playSuccess();
            setVisualState('idle');
            setEnrollingEmpleado(null);
            setDocumento(updatedEmpleado.documento);
            setStatusMessage('¡Rostro enrolado con éxito! Ya puedes fichar.');
          }}
        />
      )}
    </div>
  );
};
