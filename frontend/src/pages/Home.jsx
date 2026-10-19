import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Plus,
  RefreshCw,
  CalendarRange,
  Scale,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
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
} from '../utils/nutrition';

const Home = () => {
  const navigate = useNavigate();
  const { user, goals, refreshProfile } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fats: 0,
    total_fiber: 0,
    total_sugars: 0,
    total_sodium: 0,
  });
  const [loading, setLoading] = useState(true);
  const [water, setWater] = useState(null);

  // Día de hoy: el objetivo y el tipo (entreno / descanso) cambian según el día
  const [dia, setDia] = useState({ goals: null, dayType: 'normal', date: null });

  // Progreso: margen de la semana y último peso
  const [semana, setSemana] = useState(null);
  const [cuerpo, setCuerpo] = useState(null);

  const [cambiandoTipo, setCambiandoTipo] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [entriesRes, statsRes, waterRes, semanaRes, cuerpoRes] = await Promise.all([
        foodApi.getEntries(),
        foodApi.getDailyStats(),
        waterApi.get(),
        foodApi.getWeekStats(),
        bodyApi.get(30),
      ]);
      // El backend ya devuelve solo las comidas del día lógico del usuario
      // (su zona horaria, con el corte a las 01:00). Antes se filtraba aquí con
      // toDateString() mientras el resumen lo calculaba el servidor en UTC, así
      // que la lista y el gráfico mostraban días distintos.
      setEntries(entriesRes.entries || []);
      setStats(statsRes.stats || {});
      setDia({
        goals: statsRes.goals || null,
        dayType: statsRes.dayType || 'normal',
        date: statsRes.date || null,
      });
      setWater(waterRes);
      setSemana(semanaRes);
      setCuerpo(cuerpoRes);
    } catch (err) {
      addToast('No se pudieron cargar los datos del día', 'error');
    } finally {
      setLoading(false);
    }
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

  const consumed = {
    calories: round(stats.total_calories),
    protein: round(stats.total_protein),
    carbs: round(stats.total_carbs),
    fats: round(stats.total_fats),
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
          fiber={stats.total_fiber}
          sugars={stats.total_sugars}
          sodium={stats.total_sodium}
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
              {entries.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {entries.length} registro{entries.length !== 1 ? 's' : ''}
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

          {loading ? (
            <div className="card p-6 flex justify-center">
              <div className="spinner" />
            </div>
          ) : entries.length === 0 ? (
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
