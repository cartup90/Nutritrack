import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Save,
  Info,
  Shield,
  Smartphone,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import api, { getErrorMessage } from '../services/api';
import BottomNav from '../components/BottomNav';
import { ACTIVITY_LEVELS, GOALS, DEFAULT_INTENSITY } from '../utils/nutrition';
import IntensityPicker from '../components/IntensityPicker';
import Diagnostics from '../components/Diagnostics';

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
    goalIntensity: 'moderate',
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  // Cambio de contraseña
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [passError, setPassError] = useState(null);
  const [passForm, setPassForm] = useState({
    actual: '',
    nueva: '',
    repetir: '',
  });

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
        goalIntensity: user.goalIntensity || 'moderate',
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

  /**
   * Cambia la contraseña.
   * Exige la actual: si alguien deja la sesión abierta, no puede apropiarse de
   * la cuenta cambiándola.
   */
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPassError(null);

    if (passForm.nueva !== passForm.repetir) {
      setPassError('Las dos contraseñas nuevas no coinciden');
      return;
    }
    if (passForm.nueva.length < 6) {
      setPassError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }

    setGuardandoPassword(true);
    try {
      await api.put('/auth/password', {
        currentPassword: passForm.actual,
        newPassword: passForm.nueva,
      });

      addToast('Contraseña actualizada', 'success');
      setCambiandoPassword(false);
      setPassForm({ actual: '', nueva: '', repetir: '' });
    } catch (err) {
      setPassError(getErrorMessage(err));
    } finally {
      setGuardandoPassword(false);
    }
  };

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

            {/* De dónde sale la proteína: por kg de peso, no por % de calorías */}
            {shown.proteinGPerKg && (
              <p className="text-[11px] text-gray-500 mt-2.5 text-center">
                Proteína calculada a{' '}
                <span className="font-semibold text-gray-700">
                  {shown.proteinGPerKg} g por kg
                </span>{' '}
                de tu peso
                {shown.fatGPerKg ? ` · grasa ${shown.fatGPerKg} g/kg` : ''}
              </p>
            )}

            {/* Aviso si hubo que recolocar macros por falta de margen */}
            {shown.macroNote && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800">{shown.macroNote}</p>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Calculado con Mifflin-St Jeor
            </p>

            {/* Aviso si saltó el suelo de seguridad */}
            {shown.floorApplied && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">
                    Déficit limitado por seguridad
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    {shown.floorReason}. El objetivo se fijó en {shown.floorKcal} kcal
                    en lugar de aplicar el recorte completo.
                  </p>
                </div>
              </div>
            )}

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
                  hint: shown.floorApplied
                    ? 'Limitado por el suelo de seguridad'
                    : shown.ajusteKcal < 0
                    ? `Déficit de ${Math.abs(shown.ajusteKcal)} kcal/día sobre tu gasto`
                    : shown.ajusteKcal > 0
                    ? `Superávit de ${shown.ajusteKcal} kcal/día sobre tu gasto`
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

            {/* Composición del gasto: TMB + TEF + NEAT + EAT */}
            {shown.breakdown && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 mb-0.5">
                  ¿En qué se va tu gasto?
                </h3>
                <p className="text-[11px] text-gray-400 mb-3">
                  Reparto estimado de las {shown.tdee} kcal que gastas al día
                </p>

                <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                  {[
                    { pct: shown.breakdown.bmrPercent, color: '#16a34a' },
                    { pct: shown.breakdown.tefPercent, color: '#3b82f6' },
                    { pct: shown.breakdown.neatPercent, color: '#f59e0b' },
                    { pct: shown.breakdown.eatPercent, color: '#ef4444' },
                  ]
                    .filter((s) => s.pct > 0)
                    .map((s, i) => (
                      <div
                        key={i}
                        style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                      />
                    ))}
                </div>

                <div className="flex flex-col gap-2">
                  {[
                    {
                      color: '#16a34a',
                      label: 'TMB',
                      desc: 'Metabolismo basal · en reposo',
                      value: shown.breakdown.bmr,
                      pct: shown.breakdown.bmrPercent,
                    },
                    {
                      color: '#3b82f6',
                      label: 'TEF',
                      desc: 'Digestión de los alimentos · ~10 %',
                      value: shown.breakdown.tef,
                      pct: shown.breakdown.tefPercent,
                    },
                    {
                      color: '#f59e0b',
                      label: 'NEAT',
                      desc: 'Actividad espontánea · caminar, estar de pie',
                      value: shown.breakdown.neat,
                      pct: shown.breakdown.neatPercent,
                    },
                    {
                      color: '#ef4444',
                      label: 'EAT',
                      desc: 'Ejercicio',
                      value: shown.breakdown.eat,
                      pct: shown.breakdown.eatPercent,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-700">
                          {row.label}{' '}
                          <span className="font-normal text-gray-400">
                            · {row.pct}%
                          </span>
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">{row.desc}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-600 tabular-nums shrink-0">
                        {row.value} kcal
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                  {shown.breakdown.note}
                </p>
              </div>
            )}
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
                    setForm((p) => ({
                      ...p,
                      goal: g.value,
                      goalIntensity: DEFAULT_INTENSITY[g.value] || 'moderate',
                    }));
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

          <IntensityPicker
            goal={form.goal}
            value={form.goalIntensity}
            onChange={(v) => {
              setForm((p) => ({ ...p, goalIntensity: v }));
              setPreview(null);
            }}
          />

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

        {/* Cambio de contraseña */}
        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
            <KeyRound size={14} className="text-primary-600" />
            Contraseña
          </h2>

          {!cambiandoPassword ? (
            <button
              onClick={() => setCambiandoPassword(true)}
              className="btn btn-secondary w-full text-sm"
            >
              Cambiar mi contraseña
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">
                  Contraseña actual
                </span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passForm.actual}
                  onChange={(e) =>
                    setPassForm((p) => ({ ...p, actual: e.target.value }))
                  }
                  className="input !py-2 !text-sm"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">
                  Nueva contraseña
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  value={passForm.nueva}
                  onChange={(e) =>
                    setPassForm((p) => ({ ...p, nueva: e.target.value }))
                  }
                  className="input !py-2 !text-sm"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">
                  Repítela
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={passForm.repetir}
                  onChange={(e) =>
                    setPassForm((p) => ({ ...p, repetir: e.target.value }))
                  }
                  className="input !py-2 !text-sm"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCambiandoPassword(false);
                    setPassError(null);
                    setPassForm({ actual: '', nueva: '', repetir: '' });
                  }}
                  className="btn btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoPassword}
                  className="btn btn-primary flex-1 text-sm disabled:opacity-60"
                >
                  {guardandoPassword ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          )}

          {passError && (
            <p className="text-[11px] text-red-600">{passError}</p>
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

        {/* Datos técnicos: sirven para diagnosticar problemas en el móvil
            (versión, service worker, modo de pantalla, navegador) */}
        <Diagnostics />

        <p className="text-center text-[11px] text-gray-300 pb-2">
          NutriTrack v1.0.0
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default Profile;
