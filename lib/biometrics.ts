/**
 * Módulo de Utilidades Biométricas
 * Maneja la comparación vectorial de descriptores faciales (128 flotantes)
 * usando distancia euclidiana y similitud coseno.
 */

export interface BiometricMatchResult {
  isMatch: boolean;
  distance: number;
  score: number; // 0.0 a 1.0
  message: string;
}

/**
 * Parsea un vector biométrico desde string JSON, array numérico o Float32Array
 */
export function parseBiometricVector(data: string | number[] | Float32Array | null | undefined): number[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (data instanceof Float32Array) return Array.from(data);

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Calcula la Distancia Euclidiana estándar entre dos vectores de características faciales (128-D).
 * @param vectorA Vector de referencia
 * @param vectorB Vector actual capturado
 */
export function calcularDistanciaEuclidiana(vectorA: number[], vectorB: number[]): number {
  if (!vectorA || !vectorB || vectorA.length === 0 || vectorA.length !== vectorB.length) {
    return Infinity;
  }

  let sumSquares = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

/**
 * Compara dos descriptores biométricos determinando si pertenecen a la misma persona.
 * 
 * Regla de negocio:
 * - Coincidencia positiva si la distancia euclidiana es menor al umbral (por defecto < 0.60).
 * 
 * @param vectorA Descriptor guardado en la base de datos
 * @param vectorB Descriptor capturado en vivo por el Kiosco
 * @param umbral Umbral de distancia euclidiana (default: 0.60)
 */
export function verificarBiometria(
  vectorA: string | number[] | Float32Array | null | undefined,
  vectorB: string | number[] | Float32Array | null | undefined,
  umbral = 0.60
): BiometricMatchResult {
  const vA = parseBiometricVector(vectorA);
  const vB = parseBiometricVector(vectorB);

  if (!vA || !vB) {
    return {
      isMatch: false,
      distance: Infinity,
      score: 0,
      message: 'Datos biométricos no disponibles o formato inválido',
    };
  }

  if (vA.length !== vB.length) {
    return {
      isMatch: false,
      distance: Infinity,
      score: 0,
      message: `Dimensión de vectores incompatible (${vA.length} vs ${vB.length})`,
    };
  }

  const distance = calcularDistanciaEuclidiana(vA, vB);
  
  // Cálculo de score normalizado de confianza (0% a 100%)
  // A menor distancia, mayor confianza
  const score = Math.max(0, Math.min(1, 1 - (distance / 1.2)));
  const isMatch = distance < umbral;

  return {
    isMatch,
    distance: Number(distance.toFixed(4)),
    score: Number(score.toFixed(4)),
    message: isMatch
      ? `Verificación biométrica exitosa (Distancia: ${distance.toFixed(3)} < ${umbral})`
      : `Discrepancia facial detectada (Distancia: ${distance.toFixed(3)} >= ${umbral})`,
  };
}

/**
 * Clase con métodos utilitarios para el cliente Web (Canvas, Captura de video y Blobs)
 */
export class BiometricEngine {
  /**
   * Extrae un descriptor aproximado de 128 valores a partir del elemento de video de la cámara
   */
  static extractDescriptorFromVideo(videoElement: HTMLVideoElement): number[] | null {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    const width = 120;
    const height = 120;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const minDim = Math.min(videoElement.videoWidth, videoElement.videoHeight);
    const startX = (videoElement.videoWidth - minDim) / 2;
    const startY = (videoElement.videoHeight - minDim) / 2;

    ctx.drawImage(
      videoElement,
      startX, startY, minDim, minDim,
      0, 0, width, height
    );

    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    const descriptor: number[] = new Array(128).fill(0);
    const blockSize = Math.floor(pixels.length / (4 * 128));

    for (let i = 0; i < 128; i++) {
      let sum = 0;
      let count = 0;
      const start = i * blockSize * 4;
      const end = Math.min(start + blockSize * 4, pixels.length);

      for (let p = start; p < end; p += 4) {
        const lum = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
        sum += lum;
        count++;
      }
      descriptor[i] = count > 0 ? Number((sum / (count * 255)).toFixed(4)) : 0;
    }

    // Normalizar vector L2
    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < descriptor.length; i++) {
        descriptor[i] = Number((descriptor[i] / norm).toFixed(4));
      }
    }

    return descriptor;
  }

  /**
   * Captura un frame del video en base64 JPEG
   */
  static captureSnapshot(videoElement: HTMLVideoElement): string {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
    return '';
  }

  /**
   * Convierte un DataURL (Base64) a un objeto Blob
   */
  static dataURLtoBlob(dataurl: string): Blob {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Wrapper compatible para comparar dos descriptores
   */
  static compareDescriptors(descA: number[], descB: number[]) {
    const result = verificarBiometria(descA, descB, 0.60);
    return {
      success: result.isMatch,
      score: result.score,
      message: result.message,
    };
  }
}
