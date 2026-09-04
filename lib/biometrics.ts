import { BiometricResult } from '@/types/database';
import { decryptBiometrics } from '@/lib/cryptoBiometrics';

/**
 * Distancia Euclidiana entre dos vectores de igual dimensión (128 flotantes).
 * d(u, v) = sqrt( sum( (u_i - v_i)^2 ) )
 */
export function euclideanDistance(
  descA: number[] | Float32Array,
  descB: number[] | Float32Array
): number {
  if (!descA || !descB || descA.length === 0 || descB.length === 0) {
    return Infinity;
  }
  const len = Math.min(descA.length, descB.length);
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const diff = descA[i] - descB[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Convierte cualquier formato de descriptor (array, Float32Array, string JSON, o hex encriptado)
 * a un arreglo de números flotantes number[].
 */
export function parseDescriptor(raw: unknown): number[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return raw.map((v) => Number(v));
  }

  if (raw instanceof Float32Array) {
    return Array.from(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Caso 1: JSON array string "[0.123, -0.456, ...]"
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => Number(v));
        }
      } catch {
        // Continuar si falla el parseo
      }
    }

    // Caso 2: Descriptor previamente encriptado con AES-256 (iv:authTag:hex)
    try {
      const decrypted = decryptBiometrics(trimmed);
      if (decrypted && Array.isArray(decrypted)) {
        return decrypted;
      }
    } catch {
      // Ignorar
    }
  }

  return null;
}

/**
 * Compara dos descriptores faciales mediante Distancia Euclidiana.
 * Umbral de tolerancia: threshold < 0.6 confirma la identidad del empleado.
 */
export function compareDescriptors(
  scannedInput: number[] | Float32Array | unknown,
  savedInput: number[] | Float32Array | unknown,
  threshold: number = 0.6
): BiometricResult & { distance: number; isMatch: boolean } {
  const descA = parseDescriptor(scannedInput);
  const descB = parseDescriptor(savedInput);

  if (!descA || !descB) {
    return {
      success: false,
      isMatch: false,
      score: 0,
      distance: Infinity,
      message: 'Uno o ambos descriptores faciales son inválidos o no pudieron decodificarse.',
    };
  }

  if (descA.length !== descB.length && descA.length !== 128) {
    return {
      success: false,
      isMatch: false,
      score: 0,
      distance: Infinity,
      message: `Dimensión de vector incorrecta (Esperado: 128, Recibido: ${descA.length} vs ${descB.length}).`,
    };
  }

  const distance = Number(euclideanDistance(descA, descB).toFixed(4));
  const isMatch = distance < threshold;

  // Cálculo de confianza / score normalizado entre 0.0 y 1.0
  // Para d = 0 -> score = 1.0 (100%)
  // Para d = 0.6 -> score ~ 0.70
  // Para d >= 1.2 -> score = 0.0
  const score = Number(Math.max(0, Math.min(1, 1 - distance / 1.2)).toFixed(3));
  const percentMatch = Math.round(score * 100);

  return {
    success: isMatch,
    isMatch,
    score,
    distance,
    message: isMatch
      ? `Identidad biométrica confirmada (${percentMatch}% de coincidencia, Distancia: ${distance} < ${threshold})`
      : `Discrepancia facial detectada (${percentMatch}% de coincidencia, Distancia: ${distance} >= ${threshold})`,
  };
}

/**
 * Captura un snapshot estático en formato base64 JPEG desde un elemento HTMLVideoElement o HTMLCanvasElement.
 */
export function captureSnapshot(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): string {
  if (!source) return '';
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth || 640;
  canvas.height = sourceHeight || 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  return '';
}

/**
 * Convierte un DataURL (Base64) a un Blob binario para subida a Supabase Storage.
 */
export function dataURLtoBlob(dataurl: string): Blob {
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
 * Clase BiometricEngine conservada para total retrocompatibilidad con el resto del proyecto.
 */
export class BiometricEngine {
  static euclideanDistance(descA: number[] | Float32Array, descB: number[] | Float32Array): number {
    return euclideanDistance(descA, descB);
  }

  static parseDescriptor(raw: unknown): number[] | null {
    return parseDescriptor(raw);
  }

  static compareDescriptors(
    descA: number[] | Float32Array | unknown,
    descB: number[] | Float32Array | unknown,
    threshold: number = 0.6
  ): BiometricResult & { distance: number; isMatch: boolean } {
    return compareDescriptors(descA, descB, threshold);
  }

  static captureSnapshot(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): string {
    return captureSnapshot(source);
  }

  static dataURLtoBlob(dataurl: string): Blob {
    return dataURLtoBlob(dataurl);
  }

  /**
   * Extracción alternativa simple basada en canvas en caso de no disponer de modelos de IA en memoria.
   */
  static extractDescriptorFromVideo(
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ): number[] | null {
    if (!source) return null;
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!sourceWidth || !sourceHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const minDim = Math.min(sourceWidth, sourceHeight);
    const startX = (sourceWidth - minDim) / 2;
    const startY = (sourceHeight - minDim) / 2;
    ctx.drawImage(source, startX, startY, minDim, minDim, 0, 0, 120, 120);

    const pixels = ctx.getImageData(0, 0, 120, 120).data;
    const descriptor: number[] = new Array(128).fill(0);
    const blockSize = Math.floor(pixels.length / (4 * 128));

    for (let i = 0; i < 128; i++) {
      let sum = 0;
      let count = 0;
      const start = i * blockSize * 4;
      const end = Math.min(start + blockSize * 4, pixels.length);
      for (let p = start; p < end; p += 4) {
        sum += 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
        count++;
      }
      descriptor[i] = count > 0 ? Number((sum / (count * 255)).toFixed(4)) : 0;
    }

    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < descriptor.length; i++) {
        descriptor[i] = Number((descriptor[i] / norm).toFixed(4));
      }
    }
    return descriptor;
  }
}
