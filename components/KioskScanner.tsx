'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type * as FaceApiType from '@vladmandic/face-api';
import {
  Camera,
  CameraOff,
  Sparkles,
  Settings2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ScanFace,
  FlipHorizontal,
} from 'lucide-react';
import { captureSnapshot } from '@/lib/biometrics';

export interface KioskScannerProps {
  onDescriptorExtracted?: (descriptor: number[]) => void;
  onVideoReady?: (video: HTMLVideoElement) => void;
  isScanning?: boolean;
  statusText?: string;
  matchScore?: number | null;
  className?: string;
}

export const KioskScanner: React.FC<KioskScannerProps> = ({
  onDescriptorExtracted,
  onVideoReady,
  isScanning = true,
  statusText = 'Escaneando rostro...',
  matchScore = null,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const latestDescriptorRef = useRef<number[] | null>(null);
  const faceapiRef = useRef<typeof FaceApiType | null>(null);

  // Estados de carga e IA
  const [modelsLoaded, setModelsLoaded] = useState<boolean>(false);
  const [modelLoadingError, setModelLoadingError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean>(false);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // Detección y lista de cámaras (Camo / Webcams)
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCamoDetected, setIsCamoDetected] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // 1. Cargar los modelos de IA desde public/models en el navegador
  useEffect(() => {
    let isMounted = true;

    async function loadFaceApiModels() {
      try {
        const faceapi = await import('@vladmandic/face-api');
        faceapiRef.current = faceapi;

        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (isMounted) {
          setModelsLoaded(true);
          setModelLoadingError(null);
        }
      } catch (err: unknown) {
        console.error('Error cargando modelos de face-api:', err);
        if (isMounted) {
          setModelLoadingError(
            err instanceof Error ? err.message : 'No se pudieron cargar los modelos de IA desde /models'
          );
        }
      }
    }

    loadFaceApiModels();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Detener streams activos
  const stopCameraStream = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // 3. Conectar cámara detectando automáticamente Camo
  const startCamera = useCallback(
    async (deviceIdToUse?: string) => {
      stopCameraStream();
      setHasCameraPermission(null);
      setCameraError(null);

      try {
        // Enumerate devices para buscar Camo
        let chosenDeviceId = deviceIdToUse || selectedDeviceId;
        let camoFound = false;

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devices.filter((d) => d.kind === 'videoinput');
          setAvailableDevices(videoDevs);

          // Si no se eligió un ID específico, priorizar Camo
          if (!chosenDeviceId) {
            const camoDev = videoDevs.find(
              (d) =>
                d.label.toLowerCase().includes('camo') ||
                d.label.toLowerCase().includes('reincubate')
            );
            if (camoDev && camoDev.deviceId) {
              chosenDeviceId = camoDev.deviceId;
              camoFound = true;
            } else if (videoDevs.length > 0) {
              chosenDeviceId = videoDevs[0].deviceId;
            }
          } else {
            const currentDev = videoDevs.find((d) => d.deviceId === chosenDeviceId);
            if (currentDev && currentDev.label.toLowerCase().includes('camo')) {
              camoFound = true;
            }
          }
        } catch (e) {
          console.warn('No se pudieron listar dispositivos de video:', e);
        }

        setSelectedDeviceId(chosenDeviceId);
        setIsCamoDetected(camoFound);

        const constraints: MediaStreamConstraints = {
          video: chosenDeviceId
            ? {
                deviceId: { exact: chosenDeviceId },
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
            : {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play().catch(() => {});
              onVideoReady?.(videoRef.current);
            }
          };
        }

        setHasCameraPermission(true);
      } catch (err: unknown) {
        console.error('Error accediendo a la cámara:', err);
        setHasCameraPermission(false);
        setCameraError(
          err instanceof Error
            ? err.message
            : 'No se pudo acceder a la cámara. Revisa los permisos en tu navegador.'
        );
      }
    },
    [onVideoReady, selectedDeviceId, stopCameraStream]
  );

  // Iniciar cámara al montar
  useEffect(() => {
    startCamera();
    return () => {
      stopCameraStream();
    };
  }, [startCamera, stopCameraStream]);

  // 4. Bucle de detección facial continuo con @vladmandic/face-api
  useEffect(() => {
    let isRunning = true;

    async function detectFaceLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!isRunning) return;

      const faceapi = faceapiRef.current;

      if (
        modelsLoaded &&
        faceapi &&
        video &&
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended
      ) {
        try {
          // Detectar rostro con landmarks y descriptor de 128 flotantes
          const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
          const detection = await faceapi
            .detectSingleFace(video, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (canvas) {
            const displaySize = {
              width: video.videoWidth || 640,
              height: video.videoHeight || 480,
            };
            faceapi.matchDimensions(canvas, displaySize);

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              if (detection) {
                const resized = faceapi.resizeResults(detection, displaySize);
                const { box } = resized.detection;

                // Dibujar caja cyberpunk / neon verde personalizada
                ctx.save();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2.5;
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 10;

                // Esquinas del marco biométrico
                const cornerLength = 22;
                // Arriba-Izquierda
                ctx.beginPath();
                ctx.moveTo(box.x, box.y + cornerLength);
                ctx.lineTo(box.x, box.y);
                ctx.lineTo(box.x + cornerLength, box.y);
                ctx.stroke();

                // Arriba-Derecha
                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLength, box.y);
                ctx.lineTo(box.x + box.width, box.y);
                ctx.lineTo(box.x + box.width, box.y + cornerLength);
                ctx.stroke();

                // Abajo-Izquierda
                ctx.beginPath();
                ctx.moveTo(box.x, box.y + box.height - cornerLength);
                ctx.lineTo(box.x, box.y + box.height);
                ctx.lineTo(box.x + cornerLength, box.y + box.height);
                ctx.stroke();

                // Abajo-Derecha
                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLength, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height - cornerLength);
                ctx.stroke();

                // Dibujar puntos faciales (Landmarks) sutiles
                const positions = resized.landmarks.positions;
                ctx.fillStyle = '#4ade80';
                for (let i = 0; i < positions.length; i += 2) {
                  ctx.beginPath();
                  ctx.arc(positions[i].x, positions[i].y, 1.8, 0, 2 * Math.PI);
                  ctx.fill();
                }

                ctx.restore();
              }
            }
          }

          if (detection && detection.descriptor) {
            const descriptorArray = Array.from(detection.descriptor);
            latestDescriptorRef.current = descriptorArray;
            setFaceDetected(true);
            onDescriptorExtracted?.(descriptorArray);
          } else {
            setFaceDetected(false);
          }
        } catch (err) {
          // Errores transitorios de render
        }
      }

      if (isRunning) {
        animFrameIdRef.current = requestAnimationFrame(detectFaceLoop);
      }
    }

    animFrameIdRef.current = requestAnimationFrame(detectFaceLoop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [modelsLoaded, onDescriptorExtracted]);

  return (
    <div
      className={`relative rounded-3xl overflow-hidden glass-card-glow border border-white/10 flex flex-col items-center justify-center bg-black/40 ${className}`}
    >
      {/* Contenedor del Video y Canvas */}
      <div className="relative w-full aspect-[4/3] max-h-[460px] overflow-hidden bg-black flex items-center justify-center">
        {/* Video en vivo */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover transition-transform duration-300 ${
            isMirrored ? 'scale-x-[-1]' : 'scale-x-100'
          }`}
        />

        {/* Canvas de Bounding Box y Landmarks */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none ${
            isMirrored ? 'scale-x-[-1]' : 'scale-x-100'
          }`}
        />

        {/* Línea Láser Animada de Escaneo */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-85 shadow-[0_0_15px_#22c55e] animate-laser" />
          </div>
        )}

        {/* HUD Targeting Overlay central */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={`w-56 h-72 sm:w-64 sm:h-80 rounded-3xl border-2 transition-all duration-300 flex flex-col justify-between p-4 ${
              faceDetected
                ? 'border-neon-green/90 shadow-[0_0_25px_rgba(34,197,94,0.35)] scale-102'
                : 'border-white/20 border-dashed opacity-60'
            }`}
          >
            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-text-dim">
              <span>{faceDetected ? 'BIO-LOCK' : 'SEARCHING'}</span>
              <span>128-D</span>
            </div>

            <div className="flex justify-center">
              <ScanFace
                size={40}
                className={`transition-colors duration-300 ${
                  faceDetected ? 'text-neon-green animate-pulse' : 'text-white/20'
                }`}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-text-dim">
              <span>{isCamoDetected ? 'CAMO' : 'WEBCAM'}</span>
              <span>{faceDetected ? '100% FOCUS' : 'ALIGN FACE'}</span>
            </div>
          </div>
        </div>

        {/* Alerta si no hay permisos de cámara */}
        {hasCameraPermission === false && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="w-16 h-16 rounded-2xl bg-status-error/20 text-status-error flex items-center justify-center mb-4 border border-status-error/30">
              <CameraOff size={32} />
            </div>
            <h4 className="text-lg font-bold text-white mb-1">Cámara no disponible</h4>
            <p className="text-xs text-text-muted max-w-xs mb-4">
              {cameraError || 'Por favor otorga permisos de cámara al navegador.'}
            </p>
            <button
              type="button"
              onClick={() => startCamera()}
              className="px-4 py-2 rounded-xl bg-neon-green text-black text-xs font-bold shadow-neon flex items-center gap-1.5 hover:brightness-110"
            >
              <RefreshCw size={14} />
              Reintentar Conexión
            </button>
          </div>
        )}

        {/* Alerta de Carga de Modelos */}
        {!modelsLoaded && !modelLoadingError && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/80 border border-white/10 backdrop-blur-md text-[11px] font-semibold text-text-muted">
            <RefreshCw size={12} className="animate-spin text-neon-green" />
            Cargando redes neuronales biométricas...
          </div>
        )}

        {modelLoadingError && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-status-error/20 border border-status-error/30 backdrop-blur-md text-[11px] font-semibold text-status-error">
            <AlertCircle size={14} />
            {modelLoadingError}
          </div>
        )}

        {/* Badges Flotantes Superiores */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {/* Badge Camo Studio */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${
              isCamoDetected
                ? 'bg-neon-emerald/20 text-neon-green border-neon-green/40 shadow-neon'
                : 'bg-black/60 text-text-muted border-white/10'
            }`}
          >
            <Camera size={12} />
            {isCamoDetected ? 'Camo Conectado' : 'Cámara Web'}
          </div>

          {/* Toggle Espejo */}
          <button
            type="button"
            onClick={() => setIsMirrored(!isMirrored)}
            className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-text-muted hover:text-white border border-white/10 backdrop-blur-md transition-colors"
            title="Invertir vista espejo"
          >
            <FlipHorizontal size={14} />
          </button>

          {/* Configuración de Dispositivos */}
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-text-muted hover:text-white border border-white/10 backdrop-blur-md transition-colors"
            title="Seleccionar Cámara"
          >
            <Settings2 size={14} />
          </button>
        </div>

        {/* Modal de Selector de Cámara */}
        {showConfig && (
          <div className="absolute top-14 right-4 z-30 w-72 p-4 rounded-2xl bg-surface/95 border border-white/20 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Camera size={13} className="text-neon-green" /> Dispositivos de Video
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="text-text-muted hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {availableDevices.map((d, idx) => {
                const isCamo = d.label.toLowerCase().includes('camo');
                const isSelected = d.deviceId === selectedDeviceId;
                return (
                  <button
                    key={d.deviceId || idx}
                    type="button"
                    onClick={() => {
                      setSelectedDeviceId(d.deviceId);
                      startCamera(d.deviceId);
                      setShowConfig(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl text-[11px] transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'bg-neon-green/20 text-neon-green border-neon-green/40 font-bold'
                        : 'bg-white/5 text-text-muted hover:bg-white/10 border-white/5'
                    }`}
                  >
                    <span className="truncate pr-2">{d.label || `Cámara ${idx + 1}`}</span>
                    {isCamo && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-emerald/30 text-neon-green font-mono">
                        CAMO
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Badge Inferior de Reconocimiento */}
        <div className="absolute bottom-3 inset-x-3 z-20 flex items-center justify-between">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border transition-colors ${
              faceDetected
                ? 'bg-neon-emerald/25 text-neon-green border-neon-green/40 shadow-neon'
                : 'bg-surface/80 text-text-muted border-white/10'
            }`}
          >
            {faceDetected ? (
              <>
                <CheckCircle2 size={13} className="text-neon-green" />
                <span>Rostro Detectado (128 flotantes)</span>
              </>
            ) : (
              <>
                <Sparkles size={13} />
                <span>{statusText}</span>
              </>
            )}
          </div>

          {matchScore !== null && (
            <div className="px-3 py-1 rounded-full bg-surface/90 border border-white/10 text-xs font-mono font-bold text-white backdrop-blur-md">
              Score: {Math.round(matchScore * 100)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KioskScanner;
