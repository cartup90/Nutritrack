import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Moon,
  Scale,
  Target,
  TrendingDown,
} from 'lucide-react';
import { foodApi, getErrorMessage } from '../services/api';
import { useUIStore } from '../store/uiStore';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import { formatShortDate, round } from '../utils/nutrition';

/**
 * Progreso de la semana (lunes a domingo).
 *
 * El cálculo lo hace el backend (ver backend/src/utils/weeklyProgress.js). Esta
 * pantalla solo muestra el resultado y permite marcar los días de ayuno, que son
 * la excepción a la regla: un día con muy pocas calorías no suma a la semana
 * porque se supone que faltó cargar las comidas, salvo que sea un ayuno
 * voluntario.
 */

/** Colores de las barras según el estado del día. */
const COLORES = {
  ok: '#16a34a', // cuenta
  ayuno: '#3b82f6', // ayuno voluntario
  incompleto: '#f59e0b', // descartado por carga incompleta
  sin_registro: '#e5e7eb', // sin datos
  futuro: '#f3f4f6', // todavía no pasó
};

/**
 * Suma días a una fecha 'YYYY-MM-DD'.
 *
 * Se opera en UTC a propósito: son fechas de calendario sin hora (el mismo
 * criterio que usa el backend en utils/timezone.js).
 */
const sumarDias = (ymd, dias) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + dias * 86400000);

  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
};

const kg = (valor) => `${Math.abs(valor).toFixed(2).replace('.', ',')} kg`;

/** Texto y color del estado de un día de la semana. */
const estadoDelDia = (dia, umbral) => {
  switch (dia.reason) {
    case 'ayuno':
      return {
        texto: 'Ayuno voluntario · cuenta',
        icono: Moon,
        clase: 'text-blue-600',
      };
    case 'ok':
      return {
        texto: 'Cuenta en la semana',
        icono: Check,
        clase: 'text-primary-600',
      };
    case 'incompleto':
      return {
        texto: `No cuenta: menos de ${umbral} kcal (¿faltó cargar?)`,
        icono: AlertTriangle,
        clase: 'text-amber-600',
      };
    case 'sin_registro':
      return {
        texto: 'Sin registros · no cuenta',
        icono: Info,
        clase: 'text-gray-400',
      };
    default:
      return {
        texto: 'Todavía no pasó',
        icono: CalendarRange,
        clase: 'text-gray-300',
      };
  }
};

const WeeklyProgress = () => {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(null);

  const load = useCallback(
    async (date) => {
      setLoading(true);
      try {
        setData(await foodApi.getWeekStats(date));
      } catch (err) {
        addToast(getErrorMessage(err), 'error');
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  // Sin fecha: el backend devuelve la semana en curso.
  useEffect(() => {
    load(null);
  }, [load]);

  const irASemana = (date) => load(date);

  /** Marca o desmarca el día como ayuno y recarga la semana. */
  const alternarAyuno = async (dia) => {
    setSavingDate(dia.date);
    try {
      if (dia.isFasting) {
        await foodApi.removeFastingDay(dia.date);
        addToast('Ayuno quitado', 'success');
      } else {
        await foodApi.markFastingDay(dia.date);
        addToast('Día marcado como ayuno', 'success');
      }
      await load(data.week.startDate);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSavingDate(null);
    }
  };

  const semana = data?.week;
  const estimate = data?.estimate;
  const reference = data?.reference;
  const totals = data?.totals;
  const averages = data?.averages;

  const kgPerdidos = estimate?.weightChangeKg || 0;
  const proximaLunes = semana ? sumarDias(semana.startDate, 7) : null;
  const haySemanaSiguiente = Boolean(
    semana && proximaLunes && proximaLunes <= semana.today
  );

  const chartData = (data?.days || []).map((d) => ({
    ...d,
    label: formatShortDate(`${d.date}T12:00:00`),
  }));

  return (
    <div className="screen">
      <OfflineBanner />

      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Semana</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Progreso de lunes a domingo y peso estimado
        </p>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <div className="card p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : !data ? (
          <div className="card p-6 text-center text-sm text-gray-500">
            No se pudo cargar la semana.
          </div>
        ) : (
          <>
            {/* Navegación entre semanas */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => irASemana(sumarDias(semana.startDate, -7))}
                className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="text-center flex-1">
                <p className="text-sm font-semibold text-gray-800">
                  {formatShortDate(`${semana.startDate}T12:00:00`)} –{' '}
                  {formatShortDate(`${semana.endDate}T12:00:00`)}
                </p>
                <p className="text-[11px] text-gray-400">
                  {semana.isCurrentWeek ? 'Semana en curso' : 'Semana pasada'}
                </p>
              </div>

              <button
                onClick={() => irASemana(proximaLunes)}
                disabled={!haySemanaSiguiente}
                className={`p-2 rounded-lg bg-white border border-gray-200 ${
                  haySemanaSiguiente ? 'text-gray-500' : 'text-gray-200'
                }`}
                aria-label="Semana siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Balance de la semana */}
            <section className="card p-5">
              {!estimate.canEstimate ? (
                <div className="flex flex-col items-center text-center gap-2">
                  <Scale size={22} className="text-gray-300" />
                  <h2 className="font-semibold text-gray-800 text-sm">
                    Todavía no se puede estimar
                  </h2>
                  <p className="text-xs text-gray-500">
                    Completa tu perfil (peso, altura, edad y actividad) para
                    calcular tu gasto y el peso estimado.
                  </p>
                  <button
                    onClick={() => navigate('/profile')}
                    className="btn btn-primary text-sm mt-1"
                  >
                    Completar perfil
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <Scale size={14} />
                    <span className="text-[11px] font-medium">
                      Balance de la semana
                    </span>
                  </div>

                  <p
                    className={`text-3xl font-bold mt-1 leading-tight ${
                      kgPerdidos < -0.005
                        ? 'text-primary-600'
                        : kgPerdidos > 0.005
                          ? 'text-amber-600'
                          : 'text-gray-800'
                    }`}
                  >
                    {kgPerdidos < -0.005
                      ? `≈ ${kg(kgPerdidos)} perdidos`
                      : kgPerdidos > 0.005
                        ? `≈ ${kg(kgPerdidos)} ganados`
                        : 'Sin cambios'}
                  </p>

                  <p className="text-xs text-gray-500 mt-1">
                    {estimate.deficitKcal > 0 ? (
                      <>
                        <span className="font-semibold text-gray-700">
                          {estimate.deficitKcal} kcal
                        </span>{' '}
                        de déficit en {estimate.countedDays}{' '}
                        {estimate.countedDays === 1 ? 'día' : 'días'}
                      </>
                    ) : estimate.surplusKcal > 0 ? (
                      <>
                        <span className="font-semibold text-gray-700">
                          {estimate.surplusKcal} kcal
                        </span>{' '}
                        por encima de tu gasto en {estimate.countedDays}{' '}
                        {estimate.countedDays === 1 ? 'día' : 'días'}
                      </>
                    ) : (
                      <>Comiste justo lo que gastás</>
                    )}
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Flame size={12} /> Gasto estimado:{' '}
                      {reference.estimatedBurn} kcal/día
                    </span>
                    <span className="flex items-center gap-1">
                      <Target size={12} /> Objetivo: {reference.calorieGoal}{' '}
                      kcal/día
                    </span>
                  </div>

                  {!estimate.reliable && (
                    <p className="mt-3 text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      Estimación orientativa: solo hay {estimate.countedDays}{' '}
                      {estimate.countedDays === 1 ? 'día contado' : 'días contados'}
                      . Con menos de {reference.minDaysForEstimate} días el número
                      se mueve mucho.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Métricas de la semana */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-orange-500">
                  <Flame size={14} />
                  <span className="text-[11px] font-medium text-gray-500">
                    Promedio diario
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {averages.calories} kcal
                </p>
                <p className="text-[11px] text-gray-400">
                  {averages.overDays > 0
                    ? `Sobre ${averages.overDays} ${
                        averages.overDays === 1 ? 'día' : 'días'
                      } contados`
                    : 'Sin días contados'}
                </p>
              </div>

              <div className="card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-blue-500">
                  <CalendarRange size={14} />
                  <span className="text-[11px] font-medium text-gray-500">
                    Días contados
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {totals.countedDays} de {totals.daysInWeek}
                </p>
                <p className="text-[11px] text-gray-400">
                  {totals.skippedDays > 0
                    ? `${totals.skippedDays} descartado${
                        totals.skippedDays === 1 ? '' : 's'
                      } por carga incompleta`
                    : 'Ningún día descartado'}
                </p>
              </div>

              <div className="card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-primary-600">
                  <TrendingDown size={14} />
                  <span className="text-[11px] font-medium text-gray-500">
                    Consumido
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {totals.consumedKcal} kcal
                </p>
                <p className="text-[11px] text-gray-400">
                  Suma de los días que cuentan
                </p>
              </div>

              <div className="card p-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-blue-500">
                  <Moon size={14} />
                  <span className="text-[11px] font-medium text-gray-500">
                    Ayunos
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {totals.fastingCountedDays}
                </p>
                <p className="text-[11px] text-gray-400">
                  {totals.missingDays > 0
                    ? `${totals.missingDays} día${
                        totals.missingDays === 1 ? '' : 's'
                      } sin registros`
                    : 'Toda la semana con datos'}
                </p>
              </div>
            </div>

            {/* Gráfico de la semana */}
            <section className="card p-4">
              <h2 className="font-semibold text-gray-800 text-sm mb-3">
                Calorías por día
              </h2>
              <div style={{ width: '100%', height: 190 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: -22, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v, _n, item) => [
                        `${round(v)} kcal`,
                        item?.payload?.counted
                          ? 'Cuenta en la semana'
                          : 'No cuenta',
                      ]}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    {reference.estimatedBurn > 0 && (
                      <ReferenceLine
                        y={reference.estimatedBurn}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Gasto',
                          fontSize: 10,
                          fill: '#94a3b8',
                          position: 'insideTopRight',
                        }}
                      />
                    )}
                    <Bar dataKey="calories" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {chartData.map((d) => (
                        <Cell key={d.date} fill={COLORES[d.reason] || '#e5e7eb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                {[
                  { k: 'Cuenta', c: COLORES.ok },
                  { k: 'Ayuno', c: COLORES.ayuno },
                  { k: 'No cuenta', c: COLORES.incompleto },
                ].map((l) => (
                  <span
                    key={l.k}
                    className="flex items-center gap-1.5 text-[11px] text-gray-500"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ background: l.c }}
                    />
                    {l.k}
                  </span>
                ))}
              </div>
            </section>

            {/* Detalle día por día */}
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-gray-800 text-sm px-1">
                Día por día
              </h2>

              {data.days.map((dia) => {
                const estado = estadoDelDia(dia, reference.incompleteThreshold);
                const Icono = estado.icono;

                return (
                  <div key={dia.date} className="card p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 capitalize">
                        {dia.weekday}{' '}
                        <span className="font-normal text-gray-400">
                          {formatShortDate(`${dia.date}T12:00:00`)}
                        </span>
                      </p>
                      <p
                        className={`text-[11px] flex items-center gap-1 ${estado.clase}`}
                      >
                        <Icono size={11} className="shrink-0" />
                        <span className="truncate">{estado.texto}</span>
                      </p>
                    </div>

                    <p className="text-sm font-bold text-gray-800 shrink-0">
                      {dia.entryCount > 0 || dia.isFasting
                        ? `${dia.calories} kcal`
                        : '—'}
                    </p>

                    <button
                      onClick={() => alternarAyuno(dia)}
                      disabled={dia.isFuture || savingDate === dia.date}
                      className={`text-[11px] font-medium px-3 py-1.5 rounded-lg shrink-0 ${
                        dia.isFasting
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      } ${dia.isFuture ? 'opacity-40' : ''}`}
                    >
                      {savingDate === dia.date
                        ? '…'
                        : dia.isFasting
                          ? 'Quitar ayuno'
                          : 'Ayuno'}
                    </button>
                  </div>
                );
              })}
            </section>

            {/* Cómo se calcula */}
            <section className="card p-4 flex flex-col gap-2">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Info size={14} className="text-gray-400" /> Cómo se calcula
              </h2>

              <ul className="text-[11px] text-gray-500 flex flex-col gap-1.5 list-disc pl-4">
                <li>
                  La semana va de <strong>lunes a domingo</strong> y solo se
                  cuentan los días que ya pasaron.
                </li>
                <li>
                  Un día con menos de{' '}
                  <strong>{reference.incompleteThreshold} kcal</strong> (
                  {Math.round(reference.incompleteRatio * 100)} % de la
                  referencia de {reference.dailyReference} kcal) se descarta:
                  se supone que ese día no se cargaron las comidas.
                </li>
                <li>
                  Los días que marques como <strong>ayuno</strong> sí cuentan,
                  aunque tengan 0 kcal.
                </li>
                <li>
                  El déficit se mide contra tu <strong>gasto estimado</strong>{' '}
                  ({reference.estimatedBurn} kcal/día), no contra tu objetivo.
                </li>
                <li>
                  La equivalencia es la estándar:{' '}
                  <strong>{reference.kcalPerKg} kcal ≈ 1 kg</strong> de grasa.
                  Es una estimación: el agua, el glucógeno y la adaptación del
                  cuerpo mueven la balanza.
                </li>
              </ul>
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default WeeklyProgress;
