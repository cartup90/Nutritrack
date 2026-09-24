import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { foodApi } from '../services/api';
import ProgressRing from '../components/ProgressRing';
import MacroBar from '../components/MacroBar';
import FoodEntryCard from '../components/FoodEntryCard';
import BottomNav from '../components/BottomNav';
import OfflineBanner from '../components/OfflineBanner';
import EmptyState from '../components/EmptyState';
import { MACRO_COLORS, formatDate, macroBalance, round } from '../utils/nutrition';

const Home = () => {
  const navigate = useNavigate();
  const { user, goals } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fats: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [entriesRes, statsRes] = await Promise.all([
        foodApi.getEntries(),
        foodApi.getDailyStats(),
      ]);
      // El backend ya devuelve solo las comidas del día lógico del usuario
      // (su zona horaria, con el corte a las 01:00). Antes se filtraba aquí con
      // toDateString() mientras el resumen lo calculaba el servidor en UTC, así
      // que la lista y el gráfico mostraban días distintos.
      setEntries(entriesRes.entries || []);
      setStats(statsRes.stats || {});
    } catch (err) {
      addToast('No se pudieron cargar los datos del día', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

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

  const calorieGoal = goals?.calorieGoal || 2000;
  const remaining = Math.max(calorieGoal - consumed.calories, 0);
  const balance = macroBalance(consumed, goals);

  return (
    <div className="screen">
      <OfflineBanner />

      {/* Header */}
      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <p className="text-xs text-gray-400 capitalize">
          {formatDate(new Date())}
        </p>
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
        </section>

        {/* Macros */}
        <section className="card p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-sm">
            Macronutrientes
          </h2>
          {goals ? (
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
