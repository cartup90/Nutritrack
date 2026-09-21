import { useState, useEffect } from 'react';
import { Activity, Copy, Check, RefreshCw } from 'lucide-react';
import { detectarNavegadorInterno } from './InAppBrowserNotice';

/**
 * Panel de diagnóstico.
 *
 * Existe porque diagnosticar un problema en el móvil del usuario a distancia
 * es muy lento: cada intento exige ida y vuelta. Con esto, los datos reales
 * (versión, service worker, modo de pantalla, navegador) se ven de un vistazo.
 */

const Fila = ({ label, valor, tono }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
    <span
      className={`text-[11px] font-medium text-right break-all ${
        tono === 'mal' ? 'text-red-600' : tono === 'bien' ? 'text-green-700' : 'text-gray-800'
      }`}
    >
      {valor}
    </span>
  </div>
);

const Diagnostics = () => {
  const [datos, setDatos] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const recoger = async () => {
    const ua = navigator.userAgent || '';

    // Modo de pantalla: standalone = instalada
    const standalone = window.matchMedia('(display-mode: standalone)').matches;

    // ¿Hay un service worker controlando esta página?
    const controlador = navigator.serviceWorker?.controller;

    // Versión del service worker activo (se la pide a él mismo)
    let swVersion = null;
    if (controlador) {
      try {
        swVersion = await new Promise((resolve) => {
          const canal = new MessageChannel();
          const t = setTimeout(() => resolve(null), 2000);
          canal.port1.onmessage = (e) => {
            clearTimeout(t);
            resolve(e.data);
          };
          controlador.postMessage('VERSION', [canal.port2]);
        });
      } catch {
        swVersion = null;
      }
    }

    setDatos({
      build: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'desconocida',
      swVersion,
      controlado: Boolean(controlador),
      standalone,
      navegadorInterno: detectarNavegadorInterno(),
      contexto: window.isSecureContext,
      url: window.location.origin,
      ua,
      swSoportado: 'serviceWorker' in navigator,
      swRegistrados: navigator.serviceWorker
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
      pantalla: `${window.innerWidth}x${window.innerHeight}`,
    });
  };

  useEffect(() => {
    recoger();
  }, []);

  const copiar = async () => {
    if (!datos) return;
    const texto = Object.entries(datos)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  if (!datos) {
    return (
      <section className="card p-4">
        <div className="spinner mx-auto" />
      </section>
    );
  }

  return (
    <section className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
          <Activity size={14} className="text-primary-600" />
          Diagnóstico
        </h2>
        <div className="flex gap-2">
          <button
            onClick={recoger}
            className="text-gray-400 p-1"
            aria-label="Actualizar datos"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={copiar}
            className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1"
          >
            {copiado ? <Check size={11} /> : <Copy size={11} />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        <Fila label="Versión de este build" valor={datos.build} />
        <Fila
          label="Modo"
          valor={datos.standalone ? 'App instalada' : 'Pestaña del navegador'}
          tono={datos.standalone ? 'bien' : undefined}
        />
        <Fila
          label="Navegador"
          valor={datos.navegadorInterno ? `⚠ ${datos.navegadorInterno}` : 'Normal'}
          tono={datos.navegadorInterno ? 'mal' : 'bien'}
        />
        <Fila
          label="Service worker"
          valor={
            datos.controlado
              ? `activo${datos.swVersion ? ` (${datos.swVersion})` : ''}`
              : datos.swSoportado
              ? 'registrado pero sin controlar'
              : 'no soportado'
          }
          tono={
            datos.controlado
              ? datos.swVersion === datos.build
                ? 'bien'
                : 'mal'
              : 'mal'
          }
        />
        <Fila
          label="Conexión segura"
          valor={datos.contexto ? 'sí (HTTPS)' : 'no'}
          tono={datos.contexto ? 'bien' : 'mal'}
        />
        <Fila label="Origen" valor={datos.url} />
        <Fila label="Pantalla" valor={datos.pantalla} />
      </div>

      {/* Si la versión del service worker no coincide con la del build, el
          dispositivo está ejecutando código antiguo de la caché. */}
      {datos.controlado &&
        datos.swVersion &&
        datos.swVersion !== datos.build && (
          <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
            El service worker ({datos.swVersion}) no coincide con el build
            ({datos.build}): el dispositivo está sirviendo una versión cacheada.
          </p>
        )}

      <details className="mt-1">
        <summary className="text-[10px] text-gray-400 cursor-pointer">
          Ver datos completos
        </summary>
        <pre className="text-[9px] text-gray-500 whitespace-pre-wrap break-all mt-1.5 bg-gray-50 rounded-lg p-2">
          {datos.ua}
        </pre>
      </details>
    </section>
  );
};

export default Diagnostics;
