import { useState } from 'react';
import { AlertTriangle, Copy, Check, ExternalLink } from 'lucide-react';

/**
 * Aviso para navegadores internos de otras apps.
 *
 * WhatsApp, Instagram, Telegram, Facebook y compañía abren los enlaces en su
 * propio navegador integrado, no en Chrome. Y esos navegadores:
 *   · no pueden instalar la PWA (el aviso de instalar aparece pero no instala)
 *   · bloquean los selectores de archivo (tocar "tomar foto" no hace nada)
 *
 * Como compartir un enlace por WhatsApp es lo más habitual, sin este aviso el
 * usuario se queda atascado sin saber por qué, y parece un fallo de la app.
 */

const NAVEGADORES = [
  { nombre: 'WhatsApp', test: /WhatsApp/i },
  { nombre: 'Instagram', test: /Instagram/i },
  { nombre: 'Facebook', test: /FBAN|FBAV|FB_IAB|FBIOS/i },
  { nombre: 'Telegram', test: /Telegram/i },
  { nombre: 'LINE', test: /Line\//i },
  { nombre: 'TikTok', test: /TikTok|BytedanceWebview/i },
  { nombre: 'X', test: /Twitter/i },
  { nombre: 'Pinterest', test: /Pinterest/i },
];

/** Devuelve el nombre del navegador interno, o null si es un navegador normal. */
export const detectarNavegadorInterno = () => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';

  const encontrado = NAVEGADORES.find((n) => n.test.test(ua));
  if (encontrado) return encontrado.nombre;

  // WebView genérico de Android (no es Chrome aunque lo parezca)
  if (/; wv\)/i.test(ua)) return 'otra aplicación';

  return null;
};

const InAppBrowserNotice = () => {
  const [copiado, setCopiado] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  const navegador = detectarNavegadorInterno();

  if (!navegador || cerrado) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Si el navegador interno bloquea el portapapeles, se le indica a mano
      setCopiado(false);
    }
  };

  return (
    <div className="bg-amber-500 text-white px-4 py-3">
      <div className="flex gap-2.5">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            Estás dentro de {navegador}, no en Chrome
          </p>
          <p className="text-[11px] mt-1 leading-relaxed text-amber-50">
            Desde aquí la cámara no funciona y la app no se puede instalar. Abre
            este enlace en Chrome para usar todo.
          </p>

          <div className="flex flex-wrap gap-2 mt-2.5">
            <button
              onClick={copiar}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/20 flex items-center gap-1.5"
            >
              {copiado ? <Check size={12} /> : <Copy size={12} />}
              {copiado ? 'Enlace copiado' : 'Copiar enlace'}
            </button>

            <a
              href={`googlechrome://navigate?url=${encodeURIComponent(
                typeof window !== 'undefined' ? window.location.href : ''
              )}`}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white text-amber-700 flex items-center gap-1.5"
              onClick={() => setTimeout(() => setCerrado(true), 800)}
            >
              <ExternalLink size={12} /> Abrir en Chrome
            </a>
          </div>

          <p className="text-[10px] mt-2 text-amber-100">
            Si no se abre solo: copia el enlace, abre Chrome y pégalo en la barra
            de direcciones.
          </p>
        </div>

        <button
          onClick={() => setCerrado(true)}
          aria-label="Cerrar aviso"
          className="text-amber-100 text-lg leading-none shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default InAppBrowserNotice;
