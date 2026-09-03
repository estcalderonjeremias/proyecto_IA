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
  AlertCircle,
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

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onVideoReady,
  isScanning = true,
  statusText = 'Escaneando rostro...',
  matchScore = null,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const ipLoopRef = useRef<boolean>(false);
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);

  // Estados de control
  const [sourceType, setSourceType] = useState<CameraSourceType>('local');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // Dispositivos locales
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // IP Webcam del Celular
  const [ipUrl, setIpUrl] = useState<string>('http://192.168.43.1:8080');
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

  // Detener flujos activos
  const stopCurrentStreams = useCallback(() => {
    ipLoopRef.current = false;
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

      // Obtener lista de cámaras disponibles
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
            videoRef.current.play().catch(() => {});
            onVideoReady?.(videoRef.current);
          }
        };
      }
      setHasPermission(true);
    } catch (err) {
      console.warn('Error accediendo a la cámara web:', err);
      setHasPermission(false);
      setErrorMessage('No se pudo acceder a la cámara. Permite el permiso en el navegador.');
    }
  }, [onVideoReady, stopCurrentStreams]);

  // Iniciar Cámara IP (Celular con IP Webcam vía Hotspot)
  const startIpCamera = useCallback(async (targetUrl: string) => {
    stopCurrentStreams();
    setIsConnectingIp(true);
    setHasPermission(null);
    setErrorMessage('');

    const cleanBaseUrl = targetUrl.trim().replace(/\/+$/, '');
    
    // Auto-detectar endpoint según app (DroidCam, IP Camera Lite, IP Webcam)
    let candidateUrls: string[] = [];
    if (cleanBaseUrl.endsWith('.jpg') || cleanBaseUrl.endsWith('.jpeg') || cleanBaseUrl.includes('/video') || cleanBaseUrl.includes('/cam/')) {
      candidateUrls = [cleanBaseUrl];
    } else if (cleanBaseUrl.includes(':4747')) {
      // DroidCam (iPhone & Android)
      candidateUrls = [
        `${cleanBaseUrl}/cam/1/frame.jpg`,
        `${cleanBaseUrl}/cam/0/frame.jpg`,
        `${cleanBaseUrl}/shot.jpg`
      ];
    } else if (cleanBaseUrl.includes(':8081')) {
      // IP Camera Lite (iOS)
      candidateUrls = [
        `${cleanBaseUrl}/snapshot.jpg`,
        `${cleanBaseUrl}/live`
      ];
    } else {
      // Genericos
      candidateUrls = [
        `${cleanBaseUrl}/shot.jpg`,
        `${cleanBaseUrl}/cam/1/frame.jpg`,
        `${cleanBaseUrl}/snapshot.jpg`
      ];
    }

    // Probar candidatos hasta encontrar el endpoint activo
    let workingSnapshotUrl = '';
    for (const testUrl of candidateUrls) {
      try {
        const proxyUrl = `/api/camera-proxy?url=${encodeURIComponent(testUrl)}&t=${Date.now()}`;
        const check = await fetch(proxyUrl);
        if (check.ok) {
          workingSnapshotUrl = testUrl;
          break;
        }
      } catch {
        // Continuar probando
      }
    }

    if (!workingSnapshotUrl) {
      setIsConnectingIp(false);
      setHasPermission(false);
      setErrorMessage(
        `No se pudo conectar a ${cleanBaseUrl}. Verifica que el Hotspot de tu iPhone esté conectado y que la app esté transmitiendo.`
      );
      return;
    }

    const snapshotUrl = workingSnapshotUrl;
    ipLoopRef.current = true;
    setIsConnectingIp(false);
    setIpConnected(true);
    setHasPermission(true);

    // Convertir canvas a MediaStream y conectarlo a HTMLVideoElement
    try {
      const canvasStream = canvas.captureStream(25);
      activeStreamRef.current = canvasStream;
      if (videoRef.current) {
        videoRef.current.srcObject = canvasStream;
        videoRef.current.play().catch(() => {});
        onVideoReady?.(videoRef.current);
      }
    } catch (streamErr) {
      console.warn('Error en captureStream:', streamErr);
    }

    // Loop continuo para actualizar los fotogramas del celular
    const updateFrame = () => {
      if (!ipLoopRef.current) return;

      const img = new Image();
      const fetchUrl = `/api/camera-proxy?url=${encodeURIComponent(snapshotUrl)}&t=${Date.now()}`;

      img.onload = () => {
        if (!ipLoopRef.current) return;
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width || 640;
          canvas.height = img.height || 480;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        timerIdRef.current = setTimeout(updateFrame, 50); // ~20 FPS fluido
      };

      img.onerror = () => {
        if (!ipLoopRef.current) return;
        // Reintentar si se pierde un frame
        timerIdRef.current = setTimeout(updateFrame, 200);
      };

      img.src = fetchUrl;
    };

    updateFrame();
  }, [onVideoReady, stopCurrentStreams]);

  // Manejar cambio de origen
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
    // Para IP webcam por defecto conviene no espejar (cámara trasera o frontal de celular)
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
        title="Configurar Cámara / Celular"
      >
        <Settings2 size={18} />
      </button>

      {/* Botón Flotante para Espejar Video */}
      <button
        type="button"
        onClick={toggleMirror}
        className={`absolute top-3.5 left-3.5 z-20 p-2 rounded-xl border backdrop-blur-md transition-all shadow-lg ${
          isMirrored 
            ? 'bg-neon-emerald/20 text-neon-green border-neon-green/40' 
            : 'bg-[#0B0F17]/80 text-text-muted border-white/10 hover:text-white'
        }`}
        title={isMirrored ? 'Modo Espejo Activado' : 'Modo Espejo Desactivado'}
      >
        <FlipHorizontal size={18} />
      </button>

      {/* Video Element HTML5 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-transform duration-300 ${
          isMirrored ? '-scale-x-100' : 'scale-x-100'
        } ${hasPermission ? 'block' : 'hidden'}`}
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
      <div className="absolute bottom-0 left-0 right-0 px-5 py-3.5 bg-gradient-to-t from-[#090D16]/95 to-transparent flex items-center justify-between text-text-main z-10">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              hasPermission
                ? 'bg-neon-green shadow-[0_0_10px_#22C55E]'
                : 'bg-status-error shadow-[0_0_10px_#EF4444]'
            }`}
          />
          <span className="truncate max-w-[200px]">
            {hasPermission 
              ? `${statusText} (${sourceType === 'ip' ? 'Celular IP' : 'Cámara PC'})` 
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
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  sourceType === 'local'
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
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  sourceType === 'ip'
                    ? 'bg-neon-green text-black shadow-neon'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                <Smartphone size={14} />
                Celular (Hotspot IP)
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
                  Si usas DroidCam o Iriun con driver de PC, aparecerá en esta lista como webcam física.
                </p>
              </div>
            )}

            {/* Configuración Modo IP (Celular sin cables ni drivers) */}
            {sourceType === 'ip' && (
              <div className="space-y-3">
                <label className="text-xs text-text-dim block">
                  Dirección URL que muestra la app en el celular:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipUrl}
                    onChange={(e) => setIpUrl(e.target.value)}
                    placeholder="http://172.20.10.1:4747 o http://192.168.43.1:8080"
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
                    <Check size={12} className="text-neon-green" /> Si tienes iPhone (App Store):
                  </div>
                  <div>• <strong>DroidCam Webcam</strong>: Abre la app y copia el <em>Browser IP</em> (ej: <code>http://172.20.10.1:4747</code>).</div>
                  <div>• <strong>IP Camera Lite</strong>: Toca iniciar y copia la URL (ej: <code>http://172.20.10.1:8081</code>).</div>
                  <div className="pt-1 text-[10px] text-text-dim">
                    * Recuerda activar <strong>Compartir Internet (Hotspot)</strong> en tu iPhone y conectar la PC.
                  </div>
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
              <Settings2 size={13} /> Cambiar Modo
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
              <p className="text-xs">Conectando con cámara IP del celular...</p>
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
