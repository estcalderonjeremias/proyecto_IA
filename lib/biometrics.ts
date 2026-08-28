import { BiometricResult } from '@/types/database';

export class BiometricEngine {
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

    const norm = Math.sqrt(descriptor.reduce((acc, val) => acc + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < descriptor.length; i++) {
        descriptor[i] = Number((descriptor[i] / norm).toFixed(4));
      }
    }

    return descriptor;
  }

  static compareDescriptors(descA: number[], descB: number[]): BiometricResult {
    if (!descA || !descB || descA.length !== descB.length) {
      return {
        success: false,
        score: 0,
        message: 'Descriptores no compatibles o vacíos'
      };
    }

    let sumSq = 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < descA.length; i++) {
      const diff = descA[i] - descB[i];
      sumSq += diff * diff;
      dotProduct += descA[i] * descB[i];
      normA += descA[i] * descA[i];
      normB += descB[i] * descB[i];
    }

    const euclideanDistance = Math.sqrt(sumSq);
    const cosineSimilarity = (normA > 0 && normB > 0) 
      ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) 
      : 0;

    const score = Math.max(0, Math.min(1, cosineSimilarity));
    const isMatch = score >= 0.72 || euclideanDistance <= 0.65;

    return {
      success: isMatch,
      score: Number(score.toFixed(3)),
      message: isMatch 
        ? `Coincidencia biométrica (${Math.round(score * 100)}%)` 
        : `Diferencia de rasgos faciales (${Math.round(score * 100)}%)`
    };
  }

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
}
