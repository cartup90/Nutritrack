/**
 * Generador de íconos PWA sin dependencias externas.
 *
 * Crea los PNG requeridos por manifest.json (192x192, 512x512 y maskable),
 * dibujando un plato con una hoja — el símbolo de NutriTrack.
 *
 * Uso:  node scripts/generate-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'icons');

// ---------------------------------------------------------------------------
// Codificador PNG mínimo (RGBA, 8 bits)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
};

const encodePng = (width, height, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Cada scanline lleva un byte de filtro (0 = None)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const GREEN = hex('#16a34a');
const DARK_GREEN = hex('#15803d');
const LIGHT = hex('#dcfce7');
const WHITE = [255, 255, 255];

/** SDF de rectángulo redondeado. */
const roundedRect = (x, y, cx, cy, halfW, halfH, r) => {
  const dx = Math.abs(x - cx) - (halfW - r);
  const dy = Math.abs(y - cy) - (halfH - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
};

/**
 * Renderiza el ícono en un canvas RGBA.
 * @param {number} size
 * @param {boolean} maskable - si es true, el arte se reduce al 60% (safe zone)
 */
const renderIcon = (size, maskable = false) => {
  const SS = 3; // supersampling para antialiasing
  const W = size * SS;
  const H = size * SS;

  // Buffer en alta resolución
  const hi = Buffer.alloc(W * H * 4);

  const cx = W / 2;
  const cy = H / 2;

  // Con maskable el contenido debe caber en el 80% central (safe zone),
  // por eso reducimos el arte.
  const scale = maskable ? 0.62 : 0.82;
  const plateR = (W / 2) * scale;
  const ringR = plateR * 0.72;

  // Hoja (vesica) situada en la parte superior derecha del plato
  const leafCx = cx + plateR * 0.1;
  const leafCy = cy - plateR * 0.22;
  const leafLen = plateR * 0.52;
  const leafWid = plateR * 0.3;

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * W + x) * 4;

      let color;
      let alpha = 255;

      if (maskable) {
        // En maskable el fondo debe cubrir todo el cuadrado
        color = GREEN;
      } else {
        const d = roundedRect(px, py, cx, cy, W / 2, H / 2, W * 0.22);
        if (d > 0) {
          alpha = 0;
          color = GREEN;
        } else {
          color = GREEN;
        }
      }

      if (alpha === 255) {
        // Degradado sutil hacia la esquina inferior derecha
        const t = (px / W) * 0.5 + (py / H) * 0.5;
        color = [
          Math.round(GREEN[0] * (1 - t) + DARK_GREEN[0] * t),
          Math.round(GREEN[1] * (1 - t) + DARK_GREEN[1] * t),
          Math.round(GREEN[2] * (1 - t) + DARK_GREEN[2] * t),
        ];

        // Anillo exterior del plato
        const dist = Math.hypot(px - cx, py - cy);
        if (dist <= plateR) {
          color = WHITE;
        }
        if (dist <= ringR) {
          color = LIGHT;
        }

        // Hoja dentro del plato (intersección de dos círculos)
        const lx = px - leafCx;
        const ly = py - leafCy;
        const d1 = Math.hypot(lx + leafLen * 0.5, ly) - leafLen;
        const d2 = Math.hypot(lx - leafLen * 0.5, ly) - leafLen;
        const leaf = Math.max(d1, d2);
        if (leaf <= 0) {
          color = GREEN;
        }

        // Tallo de la hoja
        const stemDx = lx - leafLen * 0.62;
        const stemDy = ly - leafLen * 0.62;
        if (
          Math.hypot(stemDx, stemDy) <= plateR * 0.075 &&
          (lx > leafLen * 0.1 || ly > leafLen * 0.1)
        ) {
          color = GREEN;
        }
      }

      hi[i] = color[0];
      hi[i + 1] = color[1];
      hi[i + 2] = color[2];
      hi[i + 3] = alpha;
    }
  }

  // Downsample (promedio de SS x SS)
  const out = Buffer.alloc(size * size * 4);
  const area = SS * SS;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const si = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          const sa = hi[si + 3] / 255;
          // Premultiplicamos para evitar halos en los bordes
          r += hi[si] * sa;
          g += hi[si + 1] * sa;
          b += hi[si + 2] * sa;
          a += sa;
        }
      }

      const di = (y * size + x) * 4;
      if (a === 0) {
        out[di] = 0;
        out[di + 1] = 0;
        out[di + 2] = 0;
        out[di + 3] = 0;
      } else {
        out[di] = Math.round(r / a);
        out[di + 1] = Math.round(g / a);
        out[di + 2] = Math.round(b / a);
        out[di + 3] = Math.round((a / area) * 255);
      }
    }
  }

  return encodePng(size, size, out);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192x192.png', 192, false],
  ['icon-512x512.png', 512, false],
  ['icon-maskable-192x192.png', 192, true],
  ['icon-maskable-512x512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-48x48.png', 48, false],
];

for (const [name, size, maskable] of targets) {
  const png = renderIcon(size, maskable);
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`✔ ${name} (${size}x${size}${maskable ? ', maskable' : ''}) — ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\nÍconos generados en: ${OUT_DIR}`);
