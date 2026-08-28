'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Sparkles } from 'lucide-react';

interface WebcamScannerProps {
  onVideoReady?: (video: HTMLVideoElement) => void;
  isScanning?: boolean;
  statusText?: string;
  matchScore?: number | null;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onVideoReady,
  isScanning = true,
  statusText = 'Escaneando rostro...',
  matchScore = null,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const initWebcam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play();
              onVideoReady?.(videoRef.current);
            }
          };
        }
        setHasPermission(true);
      } catch (err) {
        console.warn('Error accediendo a la cámara web:', err);
        setHasPermission(false);
        setErrorMessage('Acceso a cámara denegado. Permite el uso del sensor para el reconocimiento facial.');
      }
    };

    initWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onVideoReady]);

  return (
    <div className="relative w-full max-w-[500px] aspect-[4/3] rounded-3xl overflow-hidden bg-[#090D16] border-2 border-neon-emerald/30 shadow-card">
      {/* Video Element HTML5 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover -scale-x-100 ${hasPermission ? 'block' : 'hidden'}`}
      />

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

      {/* Sin Permisos */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 text-text-muted">
          <CameraOff size={42} className="text-status-error" />
          <p className="text-sm max-w-[280px]">{errorMessage}</p>
        </div>
      )}

      {/* Cargando */}
      {hasPermission === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Camera size={36} className="text-neon-green animate-pulse" />
          <p className="text-xs">Iniciando sensor biométrico...</p>
        </div>
      )}
    </div>
  );
};
