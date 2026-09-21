import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.IMAGE_UPLOAD_PATH || './uploads';

// Asegura que exista el directorio de uploads
const ensureDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};

/**
 * Optimiza la imagen recibida (buffer) y la guarda en disco.
 * Devuelve la ruta pública y el buffer optimizado en base64 para enviar a la IA.
 *
 * Política de almacenamiento:
 *  - Se re-codifica a JPEG, máx 1024px de lado, calidad 82 (~100-250 KB).
 *  - Se eliminan los metadatos EXIF (privacidad: geolocalización del dispositivo).
 *  - Las imágenes se conservan mientras exista el registro de comida asociado.
 */
export const processAndSaveImage = async (buffer) => {
  ensureDir();

  const filename = `${uuidv4()}.jpg`;
  const filepath = path.join(UPLOAD_DIR, filename);

  const optimized = await sharp(buffer)
    .rotate() // respeta la orientación EXIF antes de eliminarla
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  await fs.promises.writeFile(filepath, optimized);

  return {
    filename,
    imageUrl: `/uploads/${filename}`,
    base64: optimized.toString('base64'),
    sizeBytes: optimized.length,
  };
};

/**
 * Elimina una imagen del disco a partir de su URL pública.
 */
export const deleteImageByUrl = async (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  const filename = path.basename(imageUrl);
  const filepath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.promises.unlink(filepath);
  } catch {
    // La imagen ya no existe: no es un error bloqueante
  }
};
