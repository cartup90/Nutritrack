import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Save, Info, Shield, Smartphone } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import BottomNav from '../components/BottomNav';
import { ACTIVITY_LEVELS, GOALS } from '../utils/nutrition';

const Profile = () => {
  const navigate = useNavigate();
  const { user, goals, updateProfile, logout } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);

  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: 'female',
    height: '',
    weight: '',
    activityLevel: 'sedentary',
    goal: 'maintain',
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        age: user.age ?? '',
        gender: user.gender || 'female',
        height: user.height ?? '',
        weight: user.weight ?? '',
        activityLevel: user.activityLevel || 'sedentary',
        goal: user.goal || 'maintain',
      });
    }
  }, [user]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setPreview(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await updateProfile(form);
    setSaving(false);
    if (result.success) {
      setPreview(result.goals);
      addToast('Perfil actualizado', 'success');
    } else {
      addToast(result.error, 'error');
    }
  };

  const shown = preview || goals;

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true);

  return (
    <div className="screen">
      <header className="bg-white px-5 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Perfil</h1>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.email}</p>
      </header>

      <main className="px-4 py-4 flex flex-col gap-4">
        {/* Objetivos calculados */}
        {shown ? (
          <section className="card p-4">
            <h2 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-1.5">
              <Info size={14} className="text-primary-600" />
              Tus objetivos diarios
            </h2>
            <div className="flex items-baseline justify-center mb-4">
              <span className="text-3xl font-bold text-primary-600">
                {shown.calorieGoal}
              </span>
              <span className="text-sm text-gray-400 ml-1.5">kcal</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Proteínas', value: shown.proteinGoal, color: 'text-blue-600' },
                { label: 'Carbohidratos', value: shown.carbGoal, color: 'text-amber-600' },
                { label: 'Grasas', value: shown.fatGoal, color: 'text-red-500' },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-lg py-2">
                  <p className={`font-bold ${m.color}`}>{m.value}g</p>
                  <p className="text-[11px] text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Calculado con Mifflin-St Jeor
            </p>

            {/* Desglose del cálculo: de dónde sale cada número */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2.5">
              {[
                {
                  label: 'TMB — metabolismo basal',
                  value: shown.bmr,
                  hint: 'Lo que quemas en reposo absoluto',
                },
                {
                  label: 'Gasto total (TDEE)',
                  value: shown.tdee,
                  hint: 'TMB ajustada por tu nivel de actividad',
                },
                {
                  label: `Objetivo ${
                    GOALS.find((g) => g.value === form.goal)?.label?.toLowerCase() ||
                    ''
                  }`,
                  value: shown.calorieGoal,
                  hint:
                    shown.calorieGoal < shown.tdee
                      ? `Déficit del ${Math.round(
                          (1 - shown.calorieGoal / shown.tdee) * 100
                        )}% sobre tu gasto`
                      : shown.calorieGoal > shown.tdee
                      ? `Superávit del ${Math.round(
                          (shown.calorieGoal / shown.tdee - 1) * 100
                        )}% sobre tu gasto`
                      : 'Igual a tu gasto: mantienes peso',
                  destacado: true,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={`text-xs ${
                        row.destacado
                          ? 'font-semibold text-primary-700'
                          : 'font-medium text-gray-700'
                      }`}
                    >
                      {row.label}
                    </p>
                    <p className="text-[11px] text-gray-400">{row.hint}</p>
                  </div>
                  <span
                    className={`text-sm font-bold shrink-0 tabular-nums ${
                      row.destacado ? 'text-primary-600' : 'text-gray-700'
                    }`}
                  >
                    {row.value}
                    <span className="text-[10px] font-normal text-gray-400 ml-1">
                      kcal
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="card p-4 bg-primary-50">
            <p className="text-sm text-primary-800">
              Completa tus datos corporales para calcular automáticamente tu
              objetivo calórico y de macros.
            </p>
          </section>
        )}

        {/* Formulario */}
        <form onSubmit={handleSave} className="card p-4 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800 text-sm">Datos personales</h2>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Nombre</span>
            <input value={form.name} onChange={handleChange('name')} className="input" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Edad</span>
              <input
                type="number"
                inputMode="numeric"
                min="10"
                max="120"
                value={form.age}
                onChange={handleChange('age')}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Sexo</span>
              <select value={form.gender} onChange={handleChange('gender')} className="input">
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Altura (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                value={form.height}
                onChange={handleChange('height')}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Peso (kg)</span>
              <input
                type="number"
                inputMode="decimal"
                value={form.weight}
                onChange={handleChange('weight')}
                className="input"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Nivel de actividad</span>
            <select
              value={form.activityLevel}
              onChange={handleChange('activityLevel')}
              className="input"
            >
              {ACTIVITY_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label} — {a.description}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Objetivo</span>
            <div className="grid grid-cols-3 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => {
                    setForm((p) => ({ ...p, goal: g.value }));
                    setPreview(null);
                  }}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition ${
                    form.goal === g.value
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <span className="text-lg">{g.icon}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        {/* Info PWA */}
        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
            <Smartphone size={14} className="text-primary-600" />
            Aplicación
          </h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Instalada como app</span>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                isStandalone
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isStandalone ? 'Sí' : 'No'}
            </span>
          </div>
          {!isStandalone && (
            <p className="text-[11px] text-gray-400">
              En Chrome para Android, abre el menú ⋮ y elige «Instalar
              aplicación» o «Agregar a pantalla de inicio».
            </p>
          )}
        </section>

        {/* Privacidad */}
        <section className="card p-4 flex flex-col gap-2">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
            <Shield size={14} className="text-primary-600" />
            Tus datos
          </h2>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Tus fotos se comprimen y se les elimina la información de
            geolocalización (EXIF). Las imágenes se borran automáticamente
            cuando eliminas el registro de comida asociado. Tu contraseña se
            almacena cifrada y tus datos de salud nunca se comparten con
            terceros.
          </p>
        </section>

        <button
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          className="btn btn-secondary w-full flex items-center justify-center gap-2 text-red-600"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>

        <p className="text-center text-[11px] text-gray-300 pb-2">
          NutriTrack v1.0.0
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default Profile;
