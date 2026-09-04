'use client';

import React, { useState } from 'react';
import { Empleado } from '@/types/database';
import { BiometricEngine } from '@/lib/biometrics';
import { EmpleadosService } from '@/lib/supabaseClient';
import { sounds } from '@/lib/sound';
import { CheckCircle2, UserCheck, RefreshCw, X, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';

interface OnboardingModalProps {
  empleado: Empleado;
  videoElement: HTMLVideoElement | null;
  onClose: () => void;
  onSuccess: (updatedEmpleado: Empleado) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  empleado,
  videoElement,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<number>(1);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCaptureFace = async () => {
    if (!videoElement) {
      setErrorMsg('No se detectó señal de video. Asegúrate de encender la cámara.');
      return;
    }

    setCapturing(true);
    setErrorMsg(null);

    try {
      const snapshot = BiometricEngine.captureSnapshot(videoElement);
      let descriptor: number[] | null = null;

      // 1. Intentar extracción de alta precisión con redes neuronales de @vladmandic/face-api
      try {
        const faceapi = await import('@vladmandic/face-api');
        const detection = await faceapi
          .detectSingleFace(videoElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && detection.descriptor) {
          descriptor = Array.from(detection.descriptor);
        }
      } catch (faceErr) {
        console.warn('Extracción con red neuronal face-api no disponible, usando extractor de respaldo:', faceErr);
      }

      // 2. Extractor de respaldo si la red neuronal aún no cargó
      if (!descriptor) {
        descriptor = BiometricEngine.extractDescriptorFromVideo(videoElement);
      }

      if (!descriptor) {
        throw new Error('No se detectó un rostro claro. Centra tu cara frente al sensor.');
      }

      setPreviewPhoto(snapshot);
      setStep(2);

      // Guardar descriptor permanentemente en base de datos de Supabase vía /api/empleados/enrolar
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

      if (!enrollRes.ok) {
        const errorData = await enrollRes.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al persistir biometría en Supabase');
      }

      const { empleado: persistedEmpleado } = await enrollRes.json();

      sounds.playSuccess();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      const updated: Empleado = persistedEmpleado || {
        ...empleado,
        estado: 'Activo',
        datos_biometricos: descriptor,
      };

      setTimeout(() => {
        onSuccess(updated);
      }, 1600);
    } catch (err: unknown) {
      sounds.playError();
      setErrorMsg(err instanceof Error ? err.message : 'Error al registrar biometría');
      setCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F17]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="glass-card-glow w-full max-w-md p-8 rounded-3xl flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-200">
        {/* Botón Salir */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-main p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icono Cabecera */}
        <div className="w-16 h-16 rounded-2xl bg-neon-emerald/15 border border-neon-emerald/30 flex items-center justify-center text-neon-green mb-5 shadow-neon">
          <UserCheck size={32} />
        </div>

        <h3 className="text-2xl font-bold mb-2">
          {step === 1 ? 'Enrolamiento Facial' : '¡Registro Completado!'}
        </h3>

        <p className="text-text-muted text-sm mb-6 max-w-xs">
          Hola <strong className="text-text-main">{empleado.nombre_completo}</strong> (DNI: {empleado.documento}). Por favor, mira fijamente a la cámara para guardar tu patrón biométrico.
        </p>

        {previewPhoto && (
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-neon-green shadow-neon mb-6">
            <img src={previewPhoto} alt="Rostro Enrolado" className="w-full h-full object-cover" />
          </div>
        )}

        {errorMsg && (
          <div className="w-full mb-5 py-2 px-3 rounded-xl bg-status-error/15 text-status-error border border-status-error/30 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {step === 1 ? (
          <button
            type="button"
            onClick={handleCaptureFace}
            disabled={capturing}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-bold text-sm tracking-wide shadow-neon flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {capturing ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Extrayendo patrón facial...
              </>
            ) : (
              <>
                <ShieldCheck size={20} />
                Capturar y Guardar Rostro
              </>
            )}
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-status-success/20 text-status-success border border-status-success/30 font-semibold text-sm">
            <CheckCircle2 size={18} />
            Perfil Biométrico Activado
          </div>
        )}
      </div>
    </div>
  );
};
