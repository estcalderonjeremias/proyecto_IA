import crypto from 'crypto';

// Clave de encriptación de 32 bytes (256 bits)
const SECRET_KEY_RAW = process.env.BIOMETRIC_ENCRYPTION_KEY || 'bioaccess-secret-key-2026-aes256-gcm!';
// Asegurar que la clave tenga exactamente 32 bytes usando SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(SECRET_KEY_RAW).digest();

/**
 * Encripta un descriptor facial (array de 128 floats) con AES-256-GCM
 * Formato de salida: "iv_hex:authTag_hex:encrypted_hex"
 */
export function encryptBiometrics(descriptor: number[]): string {
  if (!descriptor || !Array.isArray(descriptor) || descriptor.length === 0) {
    throw new Error('Descriptor biométrico inválido para encriptar.');
  }

  const jsonText = JSON.stringify(descriptor);
  const iv = crypto.randomBytes(12); // 12 bytes IV recomendado para AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(jsonText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta un string encriptado con AES-256-GCM y retorna el descriptor facial (number[])
 * Si el string es JSON plano de versiones anteriores, lo parsea directamente (Compatibilidad).
 */
export function decryptBiometrics(encryptedData: string | null | undefined): number[] | null {
  if (!encryptedData) return null;

  const trimmed = encryptedData.trim();

  // Compatibilidad hacia atrás: Si el string empieza con '[', es un JSON array plano
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const parts = trimmed.split(':');
  if (parts.length !== 3) {
    console.warn('Formato de dato biométrico encriptado inválido');
    return null;
  }

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error('Error desencriptando datos biométricos:', err);
    return null;
  }
}
