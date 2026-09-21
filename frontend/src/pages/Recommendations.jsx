import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, RefreshCw, Lightbulb, Plus, Scale, Database } from 'lucide-react';
import { foodApi, getErrorMessage } from '../services/api';
import { useUIStore } from '../store/uiStore';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import MacroBar from '../components/MacroBar';
import { MACRO_COLORS, getMealLabel, round } from '../utils/nutrition';

const Recommendations = () => {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await foodApi.getSuggestions();
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const consumed = data?.consumed || {};
  const goals = data?.goals;

  return (
    <div className="screen">
      <OfflineBanner />

      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Recomendaciones</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Ideas personalizadas según tu progreso de hoy
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 text-gray-400"
          aria-label="Regenerar"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {/* Progreso actual */}
        {goals && (
          <section className="card p-4 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800 text-sm">
              Tu situación hoy
            </h2>
            <MacroBar
              label="Calorías"
              consumed={consumed.calories || 0}
              goal={goals.calorieGoal}
              unit="kcal"
              color="#16a34a"
            />
            <MacroBar
              label="Proteínas"
              consumed={consumed.protein || 0}
              goal={goals.proteinGoal}
              color={MACRO_COLORS.protein}
            />
            <MacroBar
              label="Carbohidratos"
              consumed={consumed.carbs || 0}
              goal={goals.carbGoal}
              color={MACRO_COLORS.carbs}
            />
            <MacroBar
              label="Grasas"
              consumed={consumed.fats || 0}
              goal={goals.fatGoal}
              color={MACRO_COLORS.fats}
            />
          </section>
        )}

        {loading && !data && (
          <div className="card p-8 flex flex-col items-center gap-3">
            <div className="spinner" />
            <p className="text-sm text-gray-500">
              Generando sugerencias para ti…
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="card p-5 flex flex-col items-center gap-3 text-center">
            <span className="text-3xl">🤖</span>
            <p className="font-semibold text-gray-800">
              No pudimos generar sugerencias
            </p>
            <p className="text-sm text-gray-500">{error}</p>
            <button onClick={load} className="btn btn-primary text-sm mt-1">
              Reintentar
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Consejo calculado localmente: instantáneo y sin gastar tokens.
                Se muestra siempre, incluso si la IA falla o aún no respondió. */}
            {data.advice && (
              <section className="card p-4 border-l-4 border-primary-500 flex gap-3">
                <Scale size={18} className="text-primary-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{data.advice}</p>
                  {data.cached && (
                    <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                      <Database size={11} />
                      Sugerencias guardadas
                      {data.cachedAt
                        ? ` a las ${new Date(data.cachedAt).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}{' '}
                      · sin gastar tokens
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Resumen generado por la IA */}
            {data.summary && (
              <section className="card p-4 bg-primary-50 border border-primary-100 flex gap-3">
                <Sparkles size={18} className="text-primary-600 shrink-0 mt-0.5" />
                <p className="text-sm text-primary-900">{data.summary}</p>
              </section>
            )}

            {/* Déficits detectados (calculados en el backend, no por la IA) */}
            {Array.isArray(data.gaps) && data.gaps.length > 0 && (
              <section className="flex flex-wrap gap-2">
                {data.gaps.map((gap, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 font-medium flex items-center gap-1.5"
                  >
                    <Lightbulb size={12} />
                    {gap.label}: faltan {gap.remaining} {gap.unit}
                  </span>
                ))}
              </section>
            )}

            {/* Sugerencias */}
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold text-gray-800 text-sm px-1">
                Sugerencias para ti
              </h2>
              {(data.suggestions || []).map((s, i) => (
                <div key={i} className="card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    <span className="text-xs text-gray-400 shrink-0 bg-gray-50 px-2 py-0.5 rounded-full">
                      {getMealLabel(s.meal_type)}
                    </span>
                  </div>

                  {s.why && (
                    <p className="text-xs text-gray-500 leading-relaxed">{s.why}</p>
                  )}

                  <div className="flex gap-4 text-center mt-1">
                    <div>
                      <p className="font-bold text-primary-600 text-sm">
                        {round(s.calories)}
                      </p>
                      <p className="text-[10px] text-gray-400">kcal</p>
                    </div>
                    <div>
                      <p className="font-bold text-blue-600 text-sm">
                        {round(s.protein)}g
                      </p>
                      <p className="text-[10px] text-gray-400">Proteína</p>
                    </div>
                    <div>
                      <p className="font-bold text-amber-600 text-sm">
                        {round(s.carbs)}g
                      </p>
                      <p className="text-[10px] text-gray-400">Carbos</p>
                    </div>
                    <div>
                      <p className="font-bold text-red-500 text-sm">
                        {round(s.fats)}g
                      </p>
                      <p className="text-[10px] text-gray-400">Grasas</p>
                    </div>
                  </div>

                  {Array.isArray(s.ingredients) && s.ingredients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {s.ingredients.map((ing, j) => (
                        <span
                          key={j}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                        >
                          {ing}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => navigate('/food')}
                    className="text-xs text-primary-600 font-semibold flex items-center gap-1 mt-1 self-start"
                  >
                    <Plus size={13} /> Registrar esta comida
                  </button>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default Recommendations;
