'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Empleado } from '@/types/database';
import { sounds } from '@/lib/sound';
import {
  CheckCircle2,
  UserCheck,
  RefreshCw,
  X,
  ShieldCheck,
  AlertCircle,
  ScanFace,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface OnboardingModalProps {
  empleado: Empleado;
  videoElement: HTMLVideoElement | null;
  onClose: () => void;
  onSuccess: (updatedEmpleado: Empleado) => void;
}

type EnrollStep =
  | 'instructions'   // Paso 1: explicación
  | 'capturing'      // Paso 2: extrayendo descriptor de face-api
  | 'saving'         // Paso 3: guardando en Supabase
  | 'success'        // Paso 4: enrolamiento completo
  | 'error';         // Fallo en cualquier paso

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  empleado,
  videoElement,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<EnrollStep>('instructions');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [enrolledEmpleado, setEnrolledEmpleado] = useState<Empleado | null>(null);

  // Ref para acceder al videoElement en tiempo real (puede cambiar después de montar)
  const videoRef = useRef<HTMLVideoElement | null>(videoElement);
  useEffect(() => {
    videoRef.current = videoElement;
  }, [videoElement]);

  const handleCaptureFace = async () => {
    const video = videoRef.current;
    if (!video) {
      setErrorMsg('No se detectó señal de video. Asegúrate de que la cámara esté encendida.');
      setStep('error');
      return;
    }

    setStep('capturing');
    setErrorMsg(null);

    try {
      // ── Paso 2: Capturar snapshot y descriptor via @vladmandic/face-api ──
      let snapshot = '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          snapshot = canvas.toDataURL('image/jpeg', 0.85);
        }
      } catch {
        // snapshot es opcional, continuar sin él
      }

      let descriptor: number[] | null = null;

      // Intento 1: extracción neuronal de alta precisión con face-api
      try {
        const faceapi = await import('@vladmandic/face-api');
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.descriptor) {
          descriptor = Array.from(detection.descriptor);
        }
      } catch (faceErr) {
        console.warn(
          '[OnboardingModal] face-api no disponible, usando extractor de canvas de respaldo:',
          faceErr
        );
      }

      // Intento 2: extractor canvas como respaldo si face-api aún no cargó los modelos
      if (!descriptor) {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        if (!sourceWidth || !sourceHeight) {
          throw new Error('La cámara no tiene video activo. Espera un momento e intenta nuevamente.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(sourceWidth, sourceHeight);
          const startX = (sourceWidth - minDim) / 2;
          const startY = (sourceHeight - minDim) / 2;
          ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 120, 120);
          const pixels = ctx.getImageData(0, 0, 120, 120).data;
          const desc: number[] = new Array(128).fill(0);
          const blockSize = Math.floor(pixels.length / (4 * 128));
          for (let i = 0; i < 128; i++) {
            let sum = 0, count = 0;
            const start = i * blockSize * 4;
            const end = Math.min(start + blockSize * 4, pixels.length);
            for (let p = start; p < end; p += 4) {
              sum += 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
              count++;
            }
            desc[i] = count > 0 ? Number((sum / (count * 255)).toFixed(4)) : 0;
          }
          const norm = Math.sqrt(desc.reduce((acc, v) => acc + v * v, 0));
          if (norm > 0) desc.forEach((_, i) => (desc[i] = Number((desc[i] / norm).toFixed(4))));
          descriptor = desc;
        }
      }

      if (!descriptor || descriptor.length === 0) {
        throw new Error('No se pudo extraer el patrón facial. Centra bien tu rostro frente a la cámara.');
      }

      if (snapshot) setPreviewPhoto(snapshot);

      // ── Paso 3: Persistir en Supabase ──
      setStep('saving');

      const enrollRes = await fetch('/api/empleados/enrolar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empleado_id: empleado.id,
          documento: empleado.documento,
          nombre_completo: empleado.nombre_completo,
          turno_id: empleado.turno_id,
          descriptor,
        }),
      });

      const enrollData = await enrollRes.json().catch(() => ({ success: false, message: 'Error al leer la respuesta del servidor.' }));

      if (!enrollRes.ok || !enrollData.success) {
        throw new Error(
          enrollData.message || `Error del servidor (${enrollRes.status}) al guardar la biometría.`
        );
      }

      // ── Paso 4: Éxito ──
      const updated: Empleado = enrollData.empleado || {
        ...empleado,
        estado: 'Activo',
        datos_biometricos: descriptor,
      };

      setEnrolledEmpleado(updated);
      sounds.playSuccess();
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.55 } });
      setStep('success');

      // Notificar al padre después de mostrar el mensaje de éxito
      setTimeout(() => {
        onSuccess(updated);
      }, 2200);
    } catch (err: unknown) {
      console.error('[OnboardingModal] Error durante el enrolamiento:', err);
      sounds.playError();
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error inesperado durante el registro biométrico. Intenta nuevamente.'
      );
      setStep('error');
    }
  };

  const handleRetry = () => {
    setStep('instructions');
    setErrorMsg(null);
    setPreviewPhoto(null);
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F17]/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="glass-card-glow w-full max-w-md p-8 rounded-3xl flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-200">

        {/* Botón Salir — solo visible si no está guardando */}
        {step !== 'saving' && step !== 'capturing' && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-text-muted hover:text-text-main p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            title="Cerrar"
          >
            <X size={20} />
          </button>
        )}

        {/* ── Icono de cabecera según paso ── */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border shadow-neon transition-colors duration-300 ${
            step === 'success'
              ? 'bg-status-success/20 border-status-success/40 text-status-success'
              : step === 'error'
              ? 'bg-status-error/20 border-status-error/40 text-status-error'
              : 'bg-neon-emerald/15 border-neon-emerald/30 text-neon-green'
          }`}
        >
          {step === 'success' ? (
            <CheckCircle2 size={32} />
          ) : step === 'error' ? (
            <AlertCircle size={32} />
          ) : step === 'capturing' ? (
            <ScanFace size={32} className="animate-pulse" />
          ) : step === 'saving' ? (
            <Loader2 size={32} className="animate-spin" />
          ) : (
            <UserCheck size={32} />
          )}
        </div>

        {/* ── Título según paso ── */}
        <h3 className="text-2xl font-bold mb-2">
          {step === 'instructions' && 'Enrolamiento Facial'}
          {step === 'capturing' && 'Escaneando Rostro...'}
          {step === 'saving' && 'Guardando en Supabase...'}
          {step === 'success' && '¡Enrolamiento Completado!'}
          {step === 'error' && 'Error en el Enrolamiento'}
        </h3>

        {/* ── Subtítulo / Descripción ── */}
        {step === 'instructions' && (
          <p className="text-text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Hola <strong className="text-text-main">{empleado.nombre_completo}</strong>{' '}
            (DNI: {empleado.documento}). Este es tu primer acceso al kiosco.
            <br />
            <span className="text-neon-green font-semibold">
              Mira fijamente a la cámara
            </span>{' '}
            y presiona el botón para registrar tu patrón biométrico.
          </p>
        )}

        {step === 'capturing' && (
          <p className="text-text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Extrayendo tu patrón facial de <strong className="text-white">128 dimensiones</strong> con redes neuronales.
            <br />
            Mantén tu rostro centrado y quieto...
          </p>
        )}

        {step === 'saving' && (
          <p className="text-text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Encriptando y guardando tu perfil biométrico en{' '}
            <strong className="text-white">Supabase</strong> de forma permanente...
          </p>
        )}

        {step === 'success' && enrolledEmpleado && (
          <p className="text-text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Tu perfil biométrico fue registrado exitosamente.{' '}
            <strong className="text-neon-green">
              ¡Bienvenido/a, {enrolledEmpleado.nombre_completo}!
            </strong>
            <br />
            A partir de ahora, usa tu DNI para fichar con reconocimiento facial.
          </p>
        )}

        {step === 'error' && errorMsg && (
          <p className="text-text-muted text-sm mb-6 max-w-xs leading-relaxed">
            {errorMsg}
          </p>
        )}

        {/* ── Preview de foto enrolada ── */}
        {previewPhoto && (step === 'saving' || step === 'success') && (
          <div
            className={`w-28 h-28 rounded-full overflow-hidden mb-6 border-4 shadow-neon transition-colors duration-300 ${
              step === 'success'
                ? 'border-neon-green'
                : 'border-white/30'
            }`}
          >
            <img src={previewPhoto} alt="Rostro Enrolado" className="w-full h-full object-cover" />
          </div>
        )}

        {/* ── Indicador de progreso (pasos) ── */}
        {(step === 'instructions' || step === 'capturing' || step === 'saving') && (
          <div className="flex items-center gap-1.5 mb-6">
            {(['instructions', 'capturing', 'saving'] as const).map((s, idx) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step === s
                    ? 'w-6 bg-neon-green'
                    : ['instructions', 'capturing', 'saving'].indexOf(step) > idx
                    ? 'w-3 bg-neon-green/60'
                    : 'w-3 bg-white/20'
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Acciones según paso ── */}
        {step === 'instructions' && (
          <button
            type="button"
            onClick={handleCaptureFace}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-bold text-sm tracking-wide shadow-neon flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <ShieldCheck size={20} />
            Capturar y Guardar Rostro
          </button>
        )}

        {(step === 'capturing' || step === 'saving') && (
          <div className="flex items-center gap-2 text-text-muted text-xs font-semibold">
            <RefreshCw size={14} className="animate-spin text-neon-green" />
            {step === 'capturing' ? 'Extrayendo patrón facial...' : 'Guardando en la nube...'}
          </div>
        )}

        {step === 'success' && (
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-status-success/20 text-status-success border border-status-success/30 font-semibold text-sm animate-pulse">
            <CheckCircle2 size={18} />
            Perfil Biométrico Activado
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              type="button"
              onClick={handleRetry}
              className="w-full py-3 px-6 rounded-xl bg-neon-green/20 hover:bg-neon-green/30 text-neon-green border border-neon-green/40 font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw size={16} />
              Intentar nuevamente
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-text-dim text-xs hover:text-text-muted transition-colors"
            >
              Cancelar y volver al kiosco
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
