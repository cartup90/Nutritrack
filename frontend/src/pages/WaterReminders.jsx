import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Loader2,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { waterApi, getErrorMessage } from '../services/api';
import { useUIStore } from '../store/uiStore';
import { suscribirAPush, suscripcionActual } from '../utils/push';

/**
 * Recordatorios de agua — pantalla OPCIONAL.
 *
 * Todo aquí es opt-in: los avisos vienen desactivados de fábrica y activarlos
 * exige un permiso explícito del navegador. Desactivarlos no cuesta nada y no
 * vuelve a pedir permiso si se reactivan (la suscripción se reutiliza).
 */

/** Sugerencias para no obligar a escribir la hora a mano. */
const HORAS_SUGERIDAS = [
  '08:00',
  '10:00',
  '12:00',
  '14:00',
  '16:00',
  '18:00',
  '20:00',
  '22:00',
];

const WaterReminders = () => {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const [ajustes, setAjustes] = useState(null);
  const [horas, setHoras] = useState([]);
  const [activado, setActivado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [nuevaHora, setNuevaHora] = useState('09:00');
  const [probando, setProbando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await waterApi.getReminders();
      setAjustes(res);
      setHoras(res.times || []);
      setActivado(Boolean(res.enabled));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setCargando(false);
    }
  }, [addToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Guarda las horas en el servidor si los avisos están activos. */
  const guardarHoras = async (nuevas) => {
    setHoras(nuevas);
    if (!activado) return;

    try {
      await waterApi.saveReminders({ enabled: true, times: nuevas });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const agregarHora = (hora) => {
    if (!hora) return;
    if (horas.includes(hora)) {
      addToast('Esa hora ya está añadida', 'warning');
      return;
    }
    if (horas.length >= 12) {
      addToast('Máximo 12 recordatorios al día', 'warning');
      return;
    }
    guardarHoras([...horas, hora].sort());
  };

  const quitarHora = (hora) => guardarHoras(horas.filter((h) => h !== hora));

  const activar = async () => {
    if (!horas.length) {
      addToast('Añade al menos una hora para los recordatorios', 'warning');
      return;
    }

    if (!ajustes?.pushAvailable) {
      addToast('El servidor no tiene configuradas las notificaciones', 'error');
      return;
    }

    setProcesando(true);
    try {
      // Pide permiso y suscribe ESTE dispositivo. Si ya estaba suscrito,
      // reutiliza la suscripción y no vuelve a preguntar.
      const r = await suscribirAPush(ajustes.publicKey);

      if (!r.ok) {
        addToast(r.mensaje, 'error');
        return;
      }

      await waterApi.subscribePush(r.subscription);
      await waterApi.saveReminders({ enabled: true, times: horas });

      setActivado(true);
      addToast('Recordatorios activados', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcesando(false);
    }
  };

  const desactivar = async () => {
    setProcesando(true);
    try {
      // Solo se apagan en el servidor: la suscripción del dispositivo se deja
      // viva para poder reactivar sin volver a pedir permiso.
      await waterApi.saveReminders({ enabled: false, times: horas });
      setActivado(false);
      addToast('Recordatorios desactivados', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcesando(false);
    }
  };

  const enviarPrueba = async () => {
    setProbando(true);
    try {
      const suscripcion = await suscripcionActual();

      // Si el navegador ya no tiene la suscripción (datos borrados, app
      // reinstalada), hay que volver a registrarla antes de probar.
      if (!suscripcion && ajustes?.publicKey) {
        const r = await suscribirAPush(ajustes.publicKey);
        if (r.ok) await waterApi.subscribePush(r.subscription);
      }

      await waterApi.testPush();
      addToast('Aviso de prueba enviado', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProbando(false);
    }
  };

  if (cargando) {
    return (
      <div className="screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="screen pb-24">
      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Volver" className="text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Recordatorios de agua</h1>
          <p className="text-xs text-gray-400">Opcionales y configurables</p>
        </div>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {/* Estado */}
        <section className="card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {activado ? (
              <Bell size={20} className="text-sky-500" />
            ) : (
              <BellOff size={20} className="text-gray-300" />
            )}
            <div>
              <p className="font-semibold text-gray-800 text-sm">
                {activado ? 'Activados' : 'Desactivados'}
              </p>
              <p className="text-xs text-gray-400">
                {activado
                  ? 'Te avisaremos a las horas que elijas'
                  : 'No recibirás ningún aviso'}
              </p>
            </div>
          </div>

          <button
            onClick={activado ? desactivar : activar}
            disabled={procesando || !ajustes?.pushAvailable}
            className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
              activado
                ? 'bg-gray-100 text-gray-600'
                : 'bg-sky-500 text-white'
            }`}
          >
            {procesando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : activado ? (
              'Desactivar'
            ) : (
              'Activar'
            )}
          </button>
        </section>

        {/* Si el servidor no tiene claves VAPID, se dice claramente en vez de
            ofrecer un botón que no puede funcionar. */}
        {!ajustes?.pushAvailable && (
          <section className="card p-4 text-xs text-amber-700 bg-amber-50">
            Este servidor no tiene configuradas las notificaciones push, así que
            los recordatorios no están disponibles.
          </section>
        )}

        {/* Horas elegidas */}
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-800 text-sm">
            Horas de aviso
            <span className="ml-2 text-xs font-normal text-gray-400">
              {horas.length} de 12
            </span>
          </h2>

          {horas.length === 0 ? (
            <p className="text-xs text-gray-400">
              Todavía no elegiste ninguna hora.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {horas.map((h) => (
                <span
                  key={h}
                  className="flex items-center gap-2 rounded-lg bg-sky-50 text-sky-700 px-3 py-1.5 text-sm font-semibold"
                >
                  {h}
                  <button
                    onClick={() => quitarHora(h)}
                    aria-label={`Quitar ${h}`}
                    className="text-sky-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Añadir una hora concreta */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="time"
              value={nuevaHora}
              onChange={(e) => setNuevaHora(e.target.value)}
              className="input flex-1"
            />
            <button
              onClick={() => agregarHora(nuevaHora)}
              className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700"
            >
              <Plus size={15} />
              Añadir
            </button>
          </div>

          {/* Sugerencias: más rápido que escribir la hora a mano */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {HORAS_SUGERIDAS.filter((h) => !horas.includes(h)).map((h) => (
              <button
                key={h}
                onClick={() => agregarHora(h)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500"
              >
                + {h}
              </button>
            ))}
          </div>
        </section>

        {/* Prueba */}
        {activado && (
          <button
            onClick={enviarPrueba}
            disabled={probando}
            className="card p-4 flex items-center justify-center gap-2 text-sm font-semibold text-gray-600 disabled:opacity-50"
          >
            {probando ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            Enviar un aviso de prueba
          </button>
        )}

        <p className="text-xs text-gray-400 px-1 leading-relaxed">
          Los recordatorios se pausan solos si ya alcanzaste tu meta de agua del
          día, así que no te avisarán de más. Puedes desactivarlos cuando
          quieras.
        </p>

        {/* Requisito de iPhone: solo relevante si el push está disponible */}
        {ajustes?.pushAvailable && (
          <p className="flex items-start gap-1.5 text-xs text-gray-400 px-1">
            <Check size={13} className="mt-0.5 shrink-0" />
            En Android funcionan con la app cerrada. En iPhone necesitas iOS
            16.4 o superior y tener la app añadida a la pantalla de inicio.
          </p>
        )}
      </main>
    </div>
  );
};

export default WaterReminders;
