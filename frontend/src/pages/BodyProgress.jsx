import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Info,
  Ruler,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { bodyApi, getErrorMessage } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import ProgressTabs from '../components/ProgressTabs';
import { formatShortDate, round, toDateString } from '../utils/nutrition';

/**
 * Progreso corporal: peso y medidas, con media móvil de 7 días.
 *
 * El peso diario oscila un kilo o más por retención de agua (creatina, sal, la
 * cena anterior) sin que haya cambiado nada de grasa. Por eso la gráfica
 * muestra la **media de los últimos 7 días** además del valor del día: es la
 * tendencia la que importa, no el número suelto.
 */

/** Campos que se pueden registrar, con su etiqueta y su unidad. */
const METRICAS = [
  { campo: 'weightKg', avg: 'weightAvg7d', label: 'Peso', unidad: 'kg', peso: true },
  { campo: 'waistCm', avg: 'waistAvg7d', label: 'Cintura', unidad: 'cm' },
  { campo: 'armCm', avg: 'armAvg7d', label: 'Brazo', unidad: 'cm' },
  { campo: 'thighCm', avg: 'thighAvg7d', label: 'Muslo', unidad: 'cm' },
];

const haceDias = (ymd, dias) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + dias * 86400000);

  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
};

const fmt = (valor, decimales = 1) =>
  valor === null || valor === undefined
    ? '—'
    : round(valor, decimales).toFixed(decimales).replace('.', ',');

const BodyProgress = () => {
  const addToast = useUIStore((s) => s.addToast);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const hoy = toDateString();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('weightKg');
  const [fecha, setFecha] = useState(hoy);
  const [form, setForm] = useState({ weightKg: '', waistCm: '', armCm: '', thighCm: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await bodyApi.get(90));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();

    const metrics = {};
    for (const m of METRICAS) {
      const raw = form[m.campo];
      if (raw !== '' && raw !== null && raw !== undefined) {
        metrics[m.campo] = Number(raw);
      }
    }

    if (Object.keys(metrics).length === 0) {
      addToast('Ingresá al menos un dato', 'warning');
      return;
    }

    setSaving(true);
    try {
      const res = await bodyApi.save(fecha, metrics);
      addToast('Registro guardado', 'success');

      // El peso más reciente actualiza el peso del perfil, así que los
      // objetivos cambian: se refrescan sin recargar la app.
      if (res.profileWeightUpdated) {
        await refreshProfile();
        addToast('Tus objetivos se recalcularon con el nuevo peso', 'info');
      }

      setForm({ weightKg: '', waistCm: '', armCm: '', thighCm: '' });
      setFecha(hoy);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (date) => {
    if (!window.confirm(`¿Eliminar el registro del ${formatShortDate(`${date}T12:00:00`)}?`)) {
      return;
    }

    try {
      await bodyApi.remove(date);
      addToast('Registro eliminado', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const meta = METRICAS.find((m) => m.campo === metric) || METRICAS[0];

  const chartData = useMemo(
    () =>
      (data?.chart || []).map((p) => ({
        ...p,
        label: formatShortDate(`${p.date}T12:00:00`),
      })),
    [data]
  );

  const haySerie = chartData.some((p) => p[meta.campo] !== null && p[meta.campo] !== undefined);

  const ultimo = data?.latest;
  const tendencia = data?.trend?.weeklyWeightChangeKg;
  const variacion = data?.deltas || {};

  return (
    <div className="screen">
      <OfflineBanner />

      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Progreso</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Tu peso y tus medidas, con la tendencia de la semana
        </p>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        <ProgressTabs />

        {loading ? (
          <div className="card p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : (
          <>
            {/* Resumen */}
            <section className="card p-5">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Scale size={14} />
                <span className="text-[11px] font-medium">Peso (media de 7 días)</span>
              </div>

              <div className="flex items-end gap-2 mt-1">
                <p className="text-3xl font-bold text-gray-900 leading-none">
                  {fmt(data?.averages?.weight7d)}
                </p>
                <span className="text-sm text-gray-400 mb-0.5">kg</span>
                {tendencia !== null && tendencia !== undefined && (
                  <span
                    className={`ml-auto flex items-center gap-1 text-xs font-semibold ${
                      tendencia < 0 ? 'text-primary-600' : tendencia > 0 ? 'text-amber-600' : 'text-gray-400'
                    }`}
                  >
                    {tendencia < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {tendencia > 0 ? '+' : ''}
                    {fmt(tendencia, 2)} kg/sem
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-1">
                {ultimo
                  ? `Último registro: ${fmt(ultimo.weightKg)} kg (${formatShortDate(
                      `${ultimo.date}T12:00:00`
                    )})`
                  : 'Todavía no cargaste tu peso'}
              </p>

              {tendencia !== null && tendencia !== undefined && (
                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                  Es la media de los últimos 7 días comparada con la de los 7 anteriores. El
                  peso de un día suelto no dice nada: el agua lo mueve un kilo.
                </p>
              )}
            </section>

            {/* Registro */}
            <section className="card p-4">
              <h2 className="font-semibold text-gray-800 text-sm mb-3">Registrar</h2>

              <div className="flex gap-2 mb-3">
                {[
                  { label: 'Hoy', valor: hoy },
                  { label: 'Ayer', valor: haceDias(hoy, -1) },
                ].map((op) => (
                  <button
                    key={op.valor}
                    type="button"
                    onClick={() => setFecha(op.valor)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                      fecha === op.valor
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={fecha}
                  max={hoy}
                  onChange={(e) => setFecha(e.target.value)}
                  className="input !py-1.5 !text-xs flex-1"
                  aria-label="Fecha del registro"
                />
              </div>

              <form onSubmit={handleSave} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {METRICAS.map((m) => (
                    <label key={m.campo} className="flex flex-col gap-1">
                      <span className="text-[11px] text-gray-500">
                        {m.label} {m.peso && <span className="text-gray-300">(kg)</span>}
                        {!m.peso && <span className="text-gray-300">(cm)</span>}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={m.peso ? '0.1' : '0.5'}
                        min={m.peso ? 20 : 5}
                        placeholder="—"
                        value={form[m.campo]}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, [m.campo]: e.target.value }))
                        }
                        className="input !py-2"
                      />
                    </label>
                  ))}
                </div>

                <button type="submit" disabled={saving} className="btn btn-primary text-sm">
                  {saving ? 'Guardando…' : 'Guardar registro'}
                </button>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Podés cargar solo lo que midas. El peso de la fecha más reciente actualiza
                  el de tu perfil, y con él los objetivos.
                </p>
              </form>
            </section>

            {/* Gráfica */}
            <section className="card p-4">
              <h2 className="font-semibold text-gray-800 text-sm mb-3">Evolución</h2>

              <div className="flex gap-1.5 mb-3 overflow-x-auto">
                {METRICAS.map((m) => (
                  <button
                    key={m.campo}
                    type="button"
                    onClick={() => setMetric(m.campo)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium shrink-0 ${
                      metric === m.campo
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {haySerie ? (
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={['dataMin - 1', 'dataMax + 1']}
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <Tooltip
                        formatter={(v, nombre) => [
                          `${fmt(v, 1)} ${meta.unidad}`,
                          nombre === 'media' ? `Media 7 días` : 'Día',
                        ]}
                        labelStyle={{ fontSize: 12 }}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey={meta.campo}
                        stroke="#cbd5e1"
                        strokeWidth={1.5}
                        dot={{ r: 2.5, fill: '#94a3b8' }}
                        connectNulls
                        name="día"
                      />
                      <Line
                        type="monotone"
                        dataKey={meta.avg}
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                        name="media"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-8">
                  Todavía no hay datos de {meta.label.toLowerCase()}. Cargá dos registros y acá
                  aparece la tendencia.
                </p>
              )}

              <div className="flex justify-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-300" /> Registro
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-primary-600" /> Media 7 días
                </span>
              </div>
            </section>

            {/* Medidas */}
            <section className="card p-4 flex flex-col gap-2">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <Ruler size={14} className="text-gray-400" /> Medidas
              </h2>

              <div className="flex flex-col gap-2">
                {METRICAS.filter((m) => !m.peso).map((m) => (
                  <div key={m.campo} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{m.label}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {fmt(ultimo?.[m.campo])} {ultimo?.[m.campo] != null && 'cm'}
                      </span>
                      {variacion[m.campo] !== null && variacion[m.campo] !== undefined && (
                        <span
                          className={`text-[11px] font-medium ${
                            variacion[m.campo] < 0
                              ? 'text-primary-600'
                              : variacion[m.campo] > 0
                                ? 'text-amber-600'
                                : 'text-gray-400'
                          }`}
                        >
                          {variacion[m.campo] > 0 ? '+' : ''}
                          {fmt(variacion[m.campo])} cm
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                La diferencia es contra el registro anterior de esa misma medida. Que la
                cintura baje mientras el peso se mantiene es buena señal de recomposición.
              </p>
            </section>

            {/* Historial de registros */}
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-gray-800 text-sm px-1">
                Registros ({(data?.entries || []).length})
              </h2>

              {(data?.entries || []).length === 0 ? (
                <div className="card p-5 text-center">
                  <Info size={18} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">
                    Cargá tu peso de hoy para empezar. Con dos o tres registros ya se ve la
                    tendencia.
                  </p>
                </div>
              ) : (
                [...(data.entries || [])]
                  .reverse()
                  .slice(0, 20)
                  .map((e) => (
                    <div key={e.date} className="card p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700">
                          {formatShortDate(`${e.date}T12:00:00`)}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {[
                            e.weightKg != null ? `${fmt(e.weightKg)} kg` : null,
                            e.waistCm != null ? `cintura ${fmt(e.waistCm)} cm` : null,
                            e.armCm != null ? `brazo ${fmt(e.armCm)} cm` : null,
                            e.thighCm != null ? `muslo ${fmt(e.thighCm)} cm` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Sin datos'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(e.date)}
                        className="text-gray-300 hover:text-red-500 p-1"
                        aria-label="Eliminar registro"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default BodyProgress;
