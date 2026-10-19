import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Plus,
  RefreshCw,
  CalendarRange,
  Scale,
  Wallet,
  ChevronRight,
  CloudOff,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useOfflineStore } from '../store/offlineStore';
import { bodyApi, dayTypeApi, foodApi, waterApi } from '../services/api';
import ProgressRing from '../components/ProgressRing';
import MacroBar from '../components/MacroBar';
import WaterCard from '../components/WaterCard';
import FoodEntryCard from '../components/FoodEntryCard';
import QualityCard from '../components/QualityCard';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import EmptyState from '../components/EmptyState';
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  MACRO_COLORS,
  formatDate,
  macroBalance,
  round,
  toLogicalDateString,
} from '../utils/nutrition';

const SIN_DATOS = {
  total_calories: 0,
  total_protein: 0,
  total_carbs: 0,
  total_fats: 0,
  total_fiber: 0,
  total_sugars: 0,
  total_sodium: 0,
};

/** Nombre legible de una comida guardada sin conexión. */
const nombreDePendiente = (item) => {
  const nombres = (item.payload?.foods || [])
    .map((f) => f?.name)
    .filter(Boolean)
    .join(' + ');

  return nombres || 'Comida registrada sin conexión';
};

const Home = () => {
  const navigate = useNavigate();
  const { user, goals, refreshProfile } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);

  // Comidas guardadas en el teléfono, pendientes de mandar al servidor
  const pendientes = useOfflineStore((s) => s.pending);
  const descartarPendiente = useOfflineStore((s) => s.descartar);
  const lastSyncAt = useOfflineStore((s) => s.lastSyncAt);

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(SIN_DATOS);
  const [loading, setLoading] = useState(true);
  const [water, setWater] = useState(null);

  // Día de hoy: el objetivo y el tipo (entreno / descanso) cambian según el día
  const [dia, setDia] = useState({ goals: null, dayType: 'normal', date: null });

  // Progreso: margen de la semana y último peso
  const [semana, setSemana] = useState(null);
  const [cuerpo, setCuerpo] = useState(null);

  const [cambiandoTipo, setCambiandoTipo] = useState(false);

  const loadData = useCallback(async () => {
    // allSettled y no all: sin conexión algunas respuestas pueden faltar (agua,
    // cuerpo) y no queremos que eso deje la pantalla vacía. El service worker
    // sirve lo cacheado de comidas y perfil.
    const [entriesRes, statsRes, waterRes, semanaRes, cuerpoRes] = await Promise.allSettled([
      foodApi.getEntries(),
      foodApi.getDailyStats(),
      waterApi.get(),
      foodApi.getWeekStats(),
      bodyApi.get(30),
    ]);

    const ok = (r) => r.status === 'fulfilled';

    if (ok(entriesRes)) setEntries(entriesRes.value.entries || []);
    if (ok(statsRes)) {
      setStats(statsRes.value.stats || SIN_DATOS);
      setDia({
        goals: statsRes.value.goals || null,
        dayType: statsRes.value.dayType || 'normal',
        date: statsRes.value.date || null,
      });
    } else {
      addToast('No se pudieron cargar los datos del día', 'error');
    }

    if (ok(waterRes)) setWater(waterRes.value);
    if (ok(semanaRes)) setSemana(semanaRes.value);
    if (ok(cuerpoRes)) setCuerpo(cuerpoRes.value);

    setLoading(false);
  }, [addToast]);

  /** Anota un vaso. La respuesta trae el total ya recalculado. */
  const agregarAgua = async (ml) => {
    try {
      const res = await waterApi.add(ml);
      setWater((prev) => ({ ...res, logs: [res.log, ...(prev?.logs || [])] }));
    } catch {
      addToast('No se pudo registrar el agua', 'error');
    }
  };

  /** Deshace un vaso concreto. */
  const quitarAgua = async (id) => {
    try {
      const res = await waterApi.remove(id);
      setWater((prev) => ({
        ...res,
        logs: (prev?.logs || []).filter((l) => l.id !== id),
      }));
    } catch {
      addToast('No se pudo deshacer el registro', 'error');
    }
  };

  /**
   * Cambia el tipo de día de hoy.
   *
   * El objetivo calórico del día depende de esto (en descanso el gasto baja),
   * así que se recarga el resumen y, de paso, el perfil.
   */
  const cambiarTipo = async (tipo) => {
    if (!dia.date) {
      addToast('Esperá a que cargue el día', 'warning');
      return;
    }

    setCambiandoTipo(true);
    try {
      if (tipo === 'normal') {
        await dayTypeApi.remove(dia.date);
        addToast('Día en automático: rige tu patrón semanal', 'success');
      } else {
        await dayTypeApi.set(dia.date, tipo);
        addToast(`Hoy: ${DAY_TYPE_LABELS[tipo].toLowerCase()}`, 'success');
      }
      await loadData();
      await refreshProfile();
    } catch (err) {
      addToast('No se pudo cambiar el tipo de día', 'error');
    } finally {
      setCambiandoTipo(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cuando la cola offline se sincroniza, el servidor ya tiene las comidas:
  // se recarga para que dejen de aparecer como pendientes.
  useEffect(() => {
    if (lastSyncAt) loadData();
  }, [lastSyncAt, loadData]);

  const handleUpdate = async (id, payload) => {
    await foodApi.update(id, payload);
    addToast('Registro actualizado', 'success');
    loadData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    await foodApi.remove(id);
    addToast('Registro eliminado', 'success');
    loadData();
  };

  /**
   * Comidas de hoy que están solo en el teléfono.
   *
   * Se suman al resumen para que el usuario vea lo que comió aunque todavía no
   * se haya sincronizado: si no, parecería que no registró nada.
   */
  const pendientesHoy = useMemo(
    () =>
      pendientes.filter((item) => {
        // La cola es del dispositivo: puede tener comidas de otra cuenta.
        if (user?.id && item.userId && item.userId !== user.id) return false;

        const fechaItem = item.payload?.date;
        if (!fechaItem) return false;
        return fechaItem === dia.date || (!dia.date && fechaItem === toLogicalDateString());
      }),
    [pendientes, dia.date, user?.id]
  );

  const totalesPendientes = useMemo(
    () =>
      pendientesHoy.reduce(
        (acc, item) => {
          const t = item.payload?.totals || {};
          return {
            calories: acc.calories + (Number(t.calories) || 0),
            protein: acc.protein + (Number(t.protein) || 0),
            carbs: acc.carbs + (Number(t.carbs) || 0),
            fats: acc.fats + (Number(t.fats) || 0),
            fiber: acc.fiber + (Number(t.fiber) || 0),
            sugars: acc.sugars + (Number(t.sugars) || 0),
            sodium: acc.sodium + (Number(t.sodium) || 0),
          };
        },
        { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugars: 0, sodium: 0 }
      ),
    [pendientesHoy]
  );

  const consumed = {
    calories: round(stats.total_calories + totalesPendientes.calories),
    protein: round(stats.total_protein + totalesPendientes.protein),
    carbs: round(stats.total_carbs + totalesPendientes.carbs),
    fats: round(stats.total_fats + totalesPendientes.fats),
  };

  // Objetivos del DÍA de hoy (con su tipo aplicado), no los del perfil a secas
  const hoyGoals = dia.goals || goals;
  const calorieGoal = hoyGoals?.calorieGoal || 2000;
  const remaining = Math.max(calorieGoal - consumed.calories, 0);
  const balance = macroBalance(consumed, hoyGoals);

  const margen = semana?.totals?.goalBalanceKcal ?? 0;
  const diasRestantes = semana?.totals?.remainingDays ?? 0;
  const porDia = semana?.totals?.remainingAllowancePerDay;
  const peso7d = cuerpo?.averages?.weight7d;
  const tendencia = cuerpo?.trend?.weeklyWeightChangeKg;

  return (
    <div className="screen">
      <OfflineBanner />

      {/* Header */}
      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <p className="text-xs text-gray-400 capitalize">{formatDate(new Date())}</p>
        <h1 className="text-xl font-bold text-gray-900">
          Hola, {user?.name?.split(' ')[0] || 'de nuevo'} 👋
        </h1>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {/* Resumen del día */}
        <section className="card p-5 flex flex-col items-center">
          <ProgressRing value={consumed.calories} target={calorieGoal} />
          <p className="text-sm text-gray-500 mt-3">
            {remaining > 0 ? (
              <>
                Te quedan{' '}
                <span className="font-semibold text-gray-800">{remaining}</span>{' '}
                kcal para tu objetivo
              </>
            ) : (
              <span className="font-semibold text-red-500">
                Objetivo calórico alcanzado
              </span>
            )}
          </p>

          {hoyGoals && (
            <p className="text-[11px] text-gray-400 mt-1">
              Objetivo de hoy: {calorieGoal} kcal · gasto estimado {hoyGoals.burn} kcal
            </p>
          )}
        </section>

        {/* Tipo de día: entreno o descanso (cicla el objetivo) */}
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-gray-400">
              <CalendarRange size={14} />
              <span className="text-[11px] font-medium">Tipo de día</span>
            </div>
            <span className="text-[11px] font-semibold text-gray-700">
              {DAY_TYPE_LABELS[dia.dayType]}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            <button
              type="button"
              onClick={() => cambiarTipo('normal')}
              disabled={cambiandoTipo}
              className={`py-2 rounded-lg text-[10px] font-medium leading-tight ${
                dia.dayType === 'normal'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              Auto
            </button>

            {DAY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => cambiarTipo(t.value)}
                disabled={cambiandoTipo}
                className={`py-2 rounded-lg text-[10px] font-medium leading-tight ${
                  dia.dayType === t.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            {dia.dayType === 'rest'
              ? 'Día de descanso: el gasto baja (sin EAT) y el objetivo se ajusta.'
              : dia.dayType === 'normal'
                ? 'Automático: se usa tu patrón semanal y tu actividad declarada.'
                : 'Día de entrenamiento: se mantiene el gasto de tu actividad.'}
          </p>
        </section>

        {/* Macros */}
        <section className="card p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-sm">
            Macronutrientes
          </h2>
          {hoyGoals ? (
            balance.map((m) => (
              <MacroBar
                key={m.key}
                label={m.label}
                consumed={m.consumed}
                goal={m.goal}
                color={m.color}
              />
            ))
          ) : (
            <p className="text-sm text-gray-500">
              Completa tu perfil para calcular tus objetivos de macros.{' '}
              <button
                onClick={() => navigate('/profile')}
                className="text-primary-600 font-semibold"
              >
                Ir al perfil
              </button>
            </p>
          )}
        </section>

        {/* Micronutrientes y calidad del día */}
        <QualityCard
          fiber={stats.total_fiber + totalesPendientes.fiber}
          sugars={stats.total_sugars + totalesPendientes.sugars}
          sodium={stats.total_sodium + totalesPendientes.sodium}
          scope="day"
        />

        {/* Balance de la semana y peso */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-semibold text-gray-800 text-sm">Progreso</h2>
            <button
              onClick={() => navigate('/progress')}
              className="text-[11px] text-gray-400 flex items-center gap-0.5"
            >
              Ver todo <ChevronRight size={12} />
            </button>
          </div>

          <button
            onClick={() => navigate('/progress')}
            className="card p-4 text-left flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
              <Wallet size={16} className="text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-medium">Margen de la semana</p>
              <p
                className={`text-lg font-bold leading-tight ${
                  margen > 0 ? 'text-primary-600' : margen < 0 ? 'text-amber-600' : 'text-gray-800'
                }`}
              >
                {margen > 0
                  ? `Te quedan ${margen} kcal`
                  : margen < 0
                    ? `Vas ${Math.abs(margen)} kcal por encima`
                    : 'Vas justo en el objetivo'}
              </p>
              <p className="text-[11px] text-gray-400">
                {diasRestantes > 0
                  ? porDia !== null && porDia !== undefined
                    ? `Quedan ${diasRestantes} ${
                        diasRestantes === 1 ? 'día' : 'días'
                      } · ${Math.max(porDia, 0)} kcal/día`
                    : `Quedan ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`
                  : 'Semana cerrada'}
              </p>
            </div>
          </button>

          <button
            onClick={() => navigate('/progress/body')}
            className="card p-4 text-left flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <Scale size={16} className="text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-medium">Peso (media 7 días)</p>
              <p className="text-lg font-bold text-gray-800 leading-tight">
                {peso7d !== null && peso7d !== undefined
                  ? `${round(peso7d, 1).toFixed(1).replace('.', ',')} kg`
                  : 'Sin registros'}
                {tendencia !== null && tendencia !== undefined && (
                  <span
                    className={`ml-2 text-[11px] font-semibold ${
                      tendencia < 0 ? 'text-primary-600' : 'text-amber-600'
                    }`}
                  >
                    {tendencia > 0 ? '+' : ''}
                    {tendencia.toFixed(2).replace('.', ',')} kg/sem
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400">
                {cuerpo?.latest
                  ? `Último: ${cuerpo.latest.weightKg ?? '—'} kg · registrá el de hoy`
                  : 'Cargá tu peso para ver la tendencia'}
              </p>
            </div>
          </button>
        </section>

        {/* Agua — entre los macros y las comidas: es del mismo día */}
        <WaterCard
          data={water}
          onAdd={agregarAgua}
          onRemove={quitarAgua}
          onOpenSettings={() => navigate('/water/reminders')}
        />

        {/* Comidas del día */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-semibold text-gray-800 text-sm">
              Comidas de hoy
              {entries.length + pendientesHoy.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {entries.length + pendientesHoy.length} registro
                  {entries.length + pendientesHoy.length !== 1 ? 's' : ''}
                </span>
              )}
            </h2>
            <button
              onClick={loadData}
              className="text-gray-400 p-1"
              aria-label="Recargar"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Comidas que están solo en el teléfono (se sincronizan solas) */}
          {pendientesHoy.map((item) => (
            <div
              key={item.id}
              className={`card p-3 flex items-center gap-3 border border-dashed ${
                item.error ? 'border-red-200 bg-red-50/40' : 'border-amber-300 bg-amber-50/40'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  item.error ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                }`}
              >
                <CloudOff size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">
                  {nombreDePendiente(item)}
                </p>
                <p className="text-[11px] text-gray-500">
                  {round(item.payload?.totals?.calories)} kcal ·{' '}
                  {item.error
                    ? `no se pudo guardar: ${item.error}`
                    : 'guardada en el teléfono, sin sincronizar'}
                </p>
              </div>

              <button
                onClick={() => {
                  if (window.confirm('¿Descartar esta comida guardada en el teléfono?')) {
                    descartarPendiente(item.id);
                  }
                }}
                className="text-gray-400 hover:text-red-500 p-1 shrink-0"
                aria-label="Descartar comida pendiente"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          {loading ? (
            <div className="card p-6 flex justify-center">
              <div className="spinner" />
            </div>
          ) : entries.length === 0 && pendientesHoy.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="📸"
                title="Aún no registraste comidas hoy"
                description="Saca una foto de tu plato y la IA estimará calorías y macros por ti."
                action={
                  <button
                    onClick={() => navigate('/food')}
                    className="btn btn-primary text-sm flex items-center gap-2"
                  >
                    <Camera size={16} /> Analizar mi plato
                  </button>
                }
              />
            </div>
          ) : (
            entries.map((entry) => (
              <FoodEntryCard
                key={entry.id}
                entry={entry}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))
          )}
        </section>
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate('/food')}
        className="fab"
        aria-label="Registrar comida"
      >
        <Plus size={26} />
      </button>

      <BottomNav />
    </div>
  );
};

export default Home;
