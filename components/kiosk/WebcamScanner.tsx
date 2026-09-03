'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Sparkles,
  Settings2,
  Smartphone,
  Laptop,
  FlipHorizontal,
  Wifi,
  Check,
  RefreshCw,
  X
} from 'lucide-react';

interface WebcamScannerProps {
  onVideoReady?: (video: HTMLVideoElement) => void;
  isScanning?: boolean;
  statusText?: string;
  matchScore?: number | null;
}

type CameraSourceType = 'local' | 'ip';

interface CanvasWithStream extends HTMLCanvasElement {
  captureStream(fps?: number): MediaStream;
  mozCaptureStream?(fps?: number): MediaStream;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onVideoReady,
  isScanning = true,
  statusText = 'Escaneando rostro...',
  matchScore = null,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const streamImgRef = useRef<HTMLImageElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);

  // Estados de control
  const [sourceType, setSourceType] = useState<CameraSourceType>('local');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Dispositivos locales
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // IP Webcam / DroidCam del Celular
  const [ipUrl, setIpUrl] = useState<string>('http://172.20.10.1:4747');
  const [activeIpStreamUrl, setActiveIpStreamUrl] = useState<string>('');
  const [isConnectingIp, setIsConnectingIp] = useState<boolean>(false);
  const [ipConnected, setIpConnected] = useState<boolean>(false);

  // Cargar preferencias de LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('bioaccess_cam_mode') as CameraSourceType;
      const savedIp = localStorage.getItem('bioaccess_ip_url');
      const savedMirror = localStorage.getItem('bioaccess_cam_mirror');
      const savedDevId = localStorage.getItem('bioaccess_cam_device_id');

      if (savedMode) setSourceType(savedMode);
      if (savedIp) setIpUrl(savedIp);
      if (savedMirror !== null) setIsMirrored(savedMirror === 'true');
      if (savedDevId) setSelectedDeviceId(savedDevId);
    }
  }, []);

  // Detener flujos activos de video y streams
  const stopCurrentStreams = useCallback(() => {
    isRunningRef.current = false;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamImgRef.current) {
      streamImgRef.current.onload = null;
      streamImgRef.current.onerror = null;
      streamImgRef.current.src = '';
      streamImgRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActiveIpStreamUrl('');
    setIpConnected(false);
  }, []);

  // Iniciar Cámara Local (PC / USB / DroidCam Virtual)
  const startLocalCamera = useCallback(async (deviceId?: string) => {
    stopCurrentStreams();
    setHasPermission(null);
    setErrorMessage('');

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevs);
      } catch (err) {
        console.warn('No se pudo listar dispositivos:', err);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(() => { });
            onVideoReady?.(videoRef.current);
          }
        };
      }
      setHasPermission(true);
    } catch (err) {
      console.warn('Error accediendo a la cámara local:', err);
      setHasPermission(false);
      setErrorMessage('No se pudo acceder a la cámara. Permite el permiso en el navegador.');
    }
  }, [onVideoReady, stopCurrentStreams]);

  // Iniciar Cámara por IP (DroidCam / iPhone / Android sin instalar nada en la PC)
  const startIpCamera = useCallback(async (rawUrl: string) => {
    stopCurrentStreams();
    setIsConnectingIp(true);
    setHasPermission(null);
    setErrorMessage('');

    // Sanitizar URL
    let clean = rawUrl.trim();
    if (!clean) clean = 'http://172.20.10.1:4747';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    clean = clean.replace(/\/+$/, '');

    // Determinar candidatos según el puerto o URL
    let candidateUrls: string[] = [];
    if (clean.endsWith('/video') || clean.endsWith('.jpg') || clean.endsWith('/live')) {
      candidateUrls = [clean];
    } else if (clean.includes(':4747')) {
      // DroidCam (iPhone y Android)
      candidateUrls = [
        `${clean}/video`,
        `${clean}/video?640x480`,
        `${clean}/mjpegfeed?640x480`,
      ];
    } else if (clean.includes(':8081')) {
      // IP Camera Lite (iOS)
      candidateUrls = [`${clean}/live`, `${clean}/snapshot.jpg`];
    } else if (clean.includes(':8080')) {
      // IP Webcam (Android)
      candidateUrls = [`${clean}/video`, `${clean}/shot.jpg`];
    } else {
      candidateUrls = [`${clean}/video`, clean];
    }

    // Probar candidatos hasta conectar con el flujo
    let workingUrl = '';
    for (const testUrl of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const testProxyUrl = `/api/camera-proxy?url=${encodeURIComponent(testUrl)}`;
        const testRes = await fetch(testProxyUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);

        if (testRes.ok) {
          workingUrl = testUrl;
          try {
            await testRes.body?.cancel();
          } catch {
            // Ignorar
          }
          break;
        }
      } catch {
        // Seguir probando
      }
    }

    if (!workingUrl) {
      setIsConnectingIp(false);
      setHasPermission(false);
      setErrorMessage(
        `No se pudo conectar a ${clean}. Asegúrate de que tu iPhone tenga "Compartir Internet" activado y que DroidCam esté abierta.`
      );
      return;
    }

    // Inicializar Canvas oculto
    if (!hiddenCanvasRef.current) {
      hiddenCanvasRef.current = document.createElement('canvas');
      hiddenCanvasRef.current.width = 640;
      hiddenCanvasRef.current.height = 480;
    }
    const canvas = hiddenCanvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsConnectingIp(false);
      setHasPermission(false);
      setErrorMessage('Error al inicializar el procesador de video.');
      return;
    }

    // Crear elemento Image para recibir el stream MJPEG o fotos
    const img = new Image();
    img.crossOrigin = 'anonymous';
    streamImgRef.current = img;

    const streamProxyUrl = `/api/camera-proxy?url=${encodeURIComponent(workingUrl)}`;
    setActiveIpStreamUrl(streamProxyUrl);

    let hasReceivedFirstFrame = false;

    img.onload = () => {
      if (hasReceivedFirstFrame) return;
      hasReceivedFirstFrame = true;

      isRunningRef.current = true;
      setIsConnectingIp(false);
      setIpConnected(true);
      setHasPermission(true);

      // Crear MediaStream desde el canvas para el motor biométrico
      try {
        const canvasWithStream = canvas as unknown as CanvasWithStream;
        const canvasStream = canvasWithStream.captureStream
          ? canvasWithStream.captureStream(30)
          : canvasWithStream.mozCaptureStream
            ? canvasWithStream.mozCaptureStream(30)
            : null;

        if (canvasStream) {
          activeStreamRef.current = canvasStream;
          if (videoRef.current) {
            videoRef.current.srcObject = canvasStream;
            videoRef.current.play().catch(() => { });
            onVideoReady?.(videoRef.current);
          }
        }
      } catch (err) {
        console.warn('captureStream error:', err);
      }

      // Loop de renderizado en tiempo real a 30 FPS sobre el canvas
      const render = () => {
        if (!isRunningRef.current) return;

        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          if (canvas.width !== img.naturalWidth) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        animFrameIdRef.current = requestAnimationFrame(render);
      };

      render();
    };

    img.onerror = () => {
      if (!hasReceivedFirstFrame) {
        setIsConnectingIp(false);
        setHasPermission(false);
        setErrorMessage(
          `Error en la transmisión de ${workingUrl}. Revisa la conexión con tu iPhone.`
        );
      }
    };

    img.src = streamProxyUrl;
  }, [onVideoReady, stopCurrentStreams]);

  // Manejo de cambio de modo o dispositivo
  useEffect(() => {
    if (sourceType === 'local') {
      startLocalCamera(selectedDeviceId || undefined);
    } else {
      startIpCamera(ipUrl);
    }

    return () => {
      stopCurrentStreams();
    };
  }, [sourceType, selectedDeviceId, startLocalCamera, startIpCamera, stopCurrentStreams]);

  const handleSelectMode = (mode: CameraSourceType) => {
    setSourceType(mode);
    localStorage.setItem('bioaccess_cam_mode', mode);
    if (mode === 'ip' && isMirrored) {
      setIsMirrored(false);
      localStorage.setItem('bioaccess_cam_mirror', 'false');
    }
  };

  const toggleMirror = () => {
    const next = !isMirrored;
    setIsMirrored(next);
    localStorage.setItem('bioaccess_cam_mirror', String(next));
  };

  const handleConnectIp = () => {
    localStorage.setItem('bioaccess_ip_url', ipUrl);
    startIpCamera(ipUrl);
  };

  return (
    <div className="relative w-full max-w-[500px] aspect-[4/3] rounded-3xl overflow-hidden bg-[#090D16] border-2 border-neon-emerald/30 shadow-card flex flex-col">
      {/* Botón Flotante de Configuración / Selector de Cámara */}
      <button
        type="button"
        onClick={() => setShowConfig(!showConfig)}
        className="absolute top-3.5 right-3.5 z-20 p-2 rounded-xl bg-[#0B0F17]/80 hover:bg-[#0B0F17] text-text-muted hover:text-neon-green border border-white/10 hover:border-neon-green/40 backdrop-blur-md transition-all shadow-lg"
        title="Configurar Cámara / DroidCam"
      >
        <Settings2 size={18} />
      </button>

      {/* Botón Flotante para Espejar Video */}
      <button
        type="button"
        onClick={toggleMirror}
        className={`absolute top-3.5 left-3.5 z-20 p-2 rounded-xl border backdrop-blur-md transition-all shadow-lg ${isMirrored
          ? 'bg-neon-emerald/20 text-neon-green border-neon-green/40'
          : 'bg-[#0B0F17]/80 text-text-muted border-white/10 hover:text-white'
          }`}
        title={isMirrored ? 'Modo Espejo Activado' : 'Modo Espejo Desactivado'}
      >
        <FlipHorizontal size={18} />
      </button>

      {/* Video Element HTML5 (Cámara Local y Biometría) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? '-scale-x-100' : 'scale-x-100'
          } ${hasPermission && (sourceType === 'local' || !activeIpStreamUrl) ? 'block' : 'hidden'}`}
      />

      {/* Stream Imagen MJPEG Nativo Directo para Modo Celular IP (Fluidez 100% Nativa) */}
      {sourceType === 'ip' && activeIpStreamUrl && hasPermission && (
        <img
          src={activeIpStreamUrl}
          alt="Transmisión DroidCam"
          className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? '-scale-x-100' : 'scale-x-100'
            }`}
        />
      )}

      {/* Marco Biométrico Activo con Neón Verde */}
      {hasPermission && (
        <div
          className={`absolute inset-[12%] border-2 border-dashed border-neon-green/60 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] pointer-events-none ${isScanning ? 'animate-pulse-glow' : ''
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
      <div className="absolute bottom-0 left-0 right-0 px-5 py-3.5 bg-gradient-to-t from-[#090D16]/95 to-transparent flex items-center justify-between text-text-main z-10">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <div
            className={`w-2.5 h-2.5 rounded-full ${hasPermission
              ? 'bg-neon-green shadow-[0_0_10px_#22C55E]'
              : 'bg-status-error shadow-[0_0_10px_#EF4444]'
              }`}
          />
          <span className="truncate max-w-[200px]">
            {hasPermission
              ? `${statusText} (${sourceType === 'ip' ? (ipConnected ? 'DroidCam iPhone' : 'Conectando...') : 'Cámara PC'})`
              : 'Sensor Óptico Inactivo'}
          </span>
        </div>

        {matchScore !== null && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neon-emerald/20 text-neon-green border border-neon-green/30">
            <Sparkles size={13} />
            {Math.round(matchScore * 100)}% Coincidencia
          </div>
        )}
      </div>

      {/* MODAL / PANEL DE CONFIGURACIÓN DE CÁMARA */}
      {showConfig && (
        <div className="absolute inset-0 bg-[#0B0F17]/95 backdrop-blur-md z-30 p-5 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Settings2 size={16} className="text-neon-green" />
                Configuración del Sensor Óptico
              </h4>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="text-text-muted hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            {/* Pestañas de Modo */}
            <div className="grid grid-cols-2 gap-2 mb-4 bg-surface p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => handleSelectMode('local')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${sourceType === 'local'
                  ? 'bg-neon-green text-black shadow-neon'
                  : 'text-text-muted hover:text-white'
                  }`}
              >
                <Laptop size={14} />
                Cámara PC / USB
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('ip')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${sourceType === 'ip'
                  ? 'bg-neon-green text-black shadow-neon'
                  : 'text-text-muted hover:text-white'
                  }`}
              >
                <Smartphone size={14} />
                DroidCam (iPhone)
              </button>
            </div>

            {/* Configuración Modo Local */}
            {sourceType === 'local' && (
              <div className="space-y-3">
                <label className="text-xs text-text-dim block">Seleccionar Dispositivo de Video:</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    const devId = e.target.value;
                    setSelectedDeviceId(devId);
                    localStorage.setItem('bioaccess_cam_device_id', devId);
                    startLocalCamera(devId);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-background border border-white/15 text-white text-xs focus:border-neon-green focus:outline-none"
                >
                  <option value="">Cámara por Defecto</option>
                  {availableDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Cámara ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-text-dim">
                  Si tu PC tiene cámara integrada o USB, la detectará aquí.
                </p>
              </div>
            )}

            {/* Configuración Modo IP (DroidCam iPhone Hotspot) */}
            {sourceType === 'ip' && (
              <div className="space-y-3">
                <label className="text-xs text-text-dim block">
                  Dirección Browser IP de DroidCam:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipUrl}
                    onChange={(e) => setIpUrl(e.target.value)}
                    placeholder="http://172.20.10.1:4747"
                    className="flex-1 py-2 px-3 rounded-xl bg-background border border-white/15 text-white text-xs font-mono focus:border-neon-green focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleConnectIp}
                    disabled={isConnectingIp}
                    className="px-4 py-2 rounded-xl bg-neon-emerald hover:bg-neon-green text-black font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isConnectingIp ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Wifi size={13} />
                    )}
                    Conectar
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-text-muted space-y-1">
                  <div className="font-semibold text-text-main flex items-center gap-1.5">
                    <Check size={12} className="text-neon-green" /> Conexión con tu iPhone:
                  </div>
                  <div>1. Activa <strong>Compartir Internet</strong> en tu iPhone y conecta la PC.</div>
                  <div>2. Abre <strong>DroidCam</strong> en tu iPhone.</div>
                  <div>3. Copia el <em>Browser IP</em> (ej: <code>http://172.20.10.1:4747</code>) y pulsa Conectar.</div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-4 py-2 rounded-xl bg-surface hover:bg-white/10 text-white text-xs font-semibold"
            >
              Listo
            </button>
          </div>
        </div>
      )}

      {/* Pantalla de Error / Permiso Denegado */}
      {hasPermission === false && !showConfig && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 text-text-muted z-10 bg-[#090D16]">
          <CameraOff size={42} className="text-status-error animate-bounce" />
          <p className="text-sm max-w-[320px] text-text-main font-medium">{errorMessage}</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => (sourceType === 'local' ? startLocalCamera(selectedDeviceId) : startIpCamera(ipUrl))}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Reintentar
            </button>
            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="px-4 py-2 rounded-xl bg-neon-green text-black text-xs font-bold flex items-center gap-1.5"
            >
              <Settings2 size={13} /> Configurar
            </button>
          </div>
        </div>
      )}

      {/* Pantalla de Cargando / Conectando */}
      {hasPermission === null && !showConfig && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted z-10 bg-[#090D16]">
          {isConnectingIp ? (
            <>
              <Wifi size={36} className="text-neon-green animate-pulse" />
              <p className="text-xs">Conectando con DroidCam en el iPhone...</p>
            </>
          ) : (
            <>
              <Camera size={36} className="text-neon-green animate-pulse" />
              <p className="text-xs">Iniciando sensor biométrico...</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
