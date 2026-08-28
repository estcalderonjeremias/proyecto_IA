'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, Sparkles, SwitchCamera, Smartphone } from 'lucide-react';

interface WebcamScannerProps {
  onVideoReady?: (video: HTMLVideoElement) => void;
  onSnapshotTaken?: (base64: string) => void;
  isScanning?: boolean;
  statusText?: string;
  matchScore?: number | null;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onVideoReady,
  onSnapshotTaken,
  isScanning = true,
  statusText = 'Escaneando rostro...',
  matchScore = null,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startStream = useCallback(async (mode: 'user' | 'environment') => {
    try {
      setHasPermission(null);

      // Detener pistas previas
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: mode,
        },
        audio: false,
      });

      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
            onVideoReady?.(videoRef.current);
          }
        };
      }
      setHasPermission(true);
    } catch (err) {
      console.warn('Error accediendo a la cámara:', err);
      setHasPermission(false);
      setErrorMessage('Acceso a la cámara denegado o no disponible en este dispositivo.');
    }
  }, [onVideoReady, stream]);

  useEffect(() => {
    startStream(facingMode);

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
  };

  // Manejar captura de imagen desde archivo/cámara nativa de celular
  const handleMobileFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64 && onSnapshotTaken) {
        onSnapshotTaken(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative w-full max-w-[500px] aspect-[4/3] rounded-3xl overflow-hidden bg-[#090D16] border-2 border-neon-emerald/30 shadow-card group">
      {/* Video Element HTML5 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''} ${
          hasPermission ? 'block' : 'hidden'
        }`}
      />

      {/* Input oculto para cámara nativa de celular */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleMobileFileCapture}
      />

      {/* Botón Flotante para cambiar de Cámara (Frontal / Trasera para Celulares) */}
      {hasPermission && (
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
          <button
            type="button"
            onClick={toggleCameraFacing}
            title={facingMode === 'user' ? 'Cambiar a cámara trasera (Celular)' : 'Cambiar a cámara frontal (Selfie)'}
            className="p-2.5 rounded-full bg-[#111726]/80 hover:bg-[#1E2640] text-neon-green border border-neon-emerald/40 backdrop-blur-md transition-all shadow-lg active:scale-95"
          >
            <SwitchCamera size={18} />
          </button>
        </div>
      )}

      {/* Marco Biométrico Activo con Neón Verde */}
      {hasPermission && (
        <div
          className={`absolute inset-[12%] border-2 border-dashed border-neon-green/60 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] pointer-events-none ${
            isScanning ? 'animate-pulse-glow' : ''
          }`}
          style={{ boxShadow: 'inset 0 0 25px rgba(34, 197, 94, 0.2)' }}
        >
          {isScanning && <div className="laser-line-green" />}

          {/* Esquinas HUD Estilo Biometría Futurista */}
          <div className="absolute -top-1.5 left-1/4 w-5 h-1 bg-neon-green rounded-full shadow-[0_0_8px_#22C55E]" />
          <div className="absolute -top-1.5 right-1/4 w-5 h-1 bg-neon-green rounded-full shadow-[0_0_8px_#22C55E]" />
          <div className="absolute -bottom-1.5 left-1/4 w-5 h-1 bg-neon-green rounded-full shadow-[0_0_8px_#22C55E]" />
          <div className="absolute -bottom-1.5 right-1/4 w-5 h-1 bg-neon-green rounded-full shadow-[0_0_8px_#22C55E]" />
        </div>
      )}

      {/* Barra de Estado Inferior */}
      <div className="absolute bottom-0 left-0 right-0 px-5 py-3.5 bg-gradient-to-t from-[#090D16]/95 to-transparent flex items-center justify-between text-text-main">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              hasPermission
                ? 'bg-neon-green shadow-[0_0_10px_#22C55E]'
                : 'bg-status-error shadow-[0_0_10px_#EF4444]'
            }`}
          />
          <span>{hasPermission ? statusText : 'Sensor Óptico Inactivo'}</span>
        </div>

        {matchScore !== null && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neon-emerald/20 text-neon-green border border-neon-green/30">
            <Sparkles size={13} />
            {Math.round(matchScore * 100)}% Coincidencia
          </div>
        )}
      </div>

      {/* Sin Permisos / Botón de captura móvil alternativa */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 text-text-muted bg-[#0B0F17]/95">
          <CameraOff size={42} className="text-status-error" />
          <p className="text-sm max-w-[280px]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neon-green text-bg-dark font-semibold text-xs hover:bg-neon-emerald transition-all shadow-glow-green"
          >
            <Smartphone size={16} />
            Tomar foto con cámara del celular
          </button>
        </div>
      )}

      {/* Cargando */}
      {hasPermission === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Camera size={36} className="text-neon-green animate-pulse" />
          <p className="text-xs">Iniciando sensor de cámara...</p>
        </div>
      )}
    </div>
  );
};
