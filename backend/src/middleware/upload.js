import multer from 'multer';

// Guardamos en memoria para poder optimizar/redimensionar la imagen con sharp
// antes de persistirla en disco.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error('Tipo de archivo no permitido. Solo imágenes JPEG, PNG o WebP.'));
};

const maxSizeMb = Number(process.env.IMAGE_MAX_SIZE_MB || 8);

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMb * 1024 * 1024 },
});

export default upload;
