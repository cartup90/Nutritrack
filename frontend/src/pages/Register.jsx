import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ACTIVITY_LEVELS, GOALS, DEFAULT_INTENSITY } from '../utils/nutrition';
import IntensityPicker from '../components/IntensityPicker';

const Register = () => {
  const navigate = useNavigate();
  const { register, error, clearError } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    age: '',
    gender: 'female',
    height: '',
    weight: '',
    activityLevel: 'sedentary',
    goal: 'maintain',
    goalIntensity: 'moderate',
  });

  const handleChange = (field) => (e) => {
    clearError();
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      useAuthStore.setState({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await register({
      ...form,
      age: form.age ? Number(form.age) : null,
      height: form.height ? Number(form.height) : null,
      weight: form.weight ? Number(form.weight) : null,
    });
    setLoading(false);
    if (result.success) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-primary-50 to-white">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🥗</div>
        <h1 className="text-xl font-bold text-gray-900">Crear cuenta</h1>
        <div className="flex justify-center gap-1.5 mt-3">
          <span
            className={`h-1.5 w-8 rounded-full ${step >= 1 ? 'bg-primary-600' : 'bg-gray-200'}`}
          />
          <span
            className={`h-1.5 w-8 rounded-full ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`}
          />
        </div>
      </div>

      {step === 1 && (
        <form onSubmit={handleNext} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Nombre</span>
            <div className="relative">
              <UserIcon
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                required
                placeholder="Tu nombre"
                value={form.name}
                onChange={handleChange('name')}
                className="input !pl-10"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                required
                placeholder="tu@email.com"
                value={form.email}
                onChange={handleChange('email')}
                className="input !pl-10"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">
              Contraseña
            </span>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={handleChange('password')}
                className="input !pl-10"
              />
            </div>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full mt-2">
            Continuar
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Edad</span>
              <input
                type="number"
                inputMode="numeric"
                min="10"
                max="120"
                placeholder="30"
                value={form.age}
                onChange={handleChange('age')}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Sexo</span>
              <select
                value={form.gender}
                onChange={handleChange('gender')}
                className="input"
              >
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">
                Altura (cm)
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="170"
                value={form.height}
                onChange={handleChange('height')}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">
                Peso (kg)
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="70"
                value={form.weight}
                onChange={handleChange('weight')}
                className="input"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">
              Nivel de actividad
            </span>
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
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      goal: g.value,
                      // Cada objetivo tiene su propia intensidad por defecto
                      goalIntensity: DEFAULT_INTENSITY[g.value] || 'moderate',
                    }))
                  }
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition ${
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
            onChange={(v) => setForm((p) => ({ ...p, goalIntensity: v }))}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn btn-secondary flex-1"
            >
              Atrás
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1 disabled:opacity-60"
            >
              {loading ? 'Creando…' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      )}

      {/* Antes era un enlace de texto pequeño y se pasaba por alto */}
      <div className="flex items-center gap-3 my-6">
        <span className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 whitespace-nowrap">
          ¿Ya tienes cuenta?
        </span>
        <span className="flex-1 h-px bg-gray-200" />
      </div>

      <Link
        to="/login"
        className="btn btn-secondary w-full block text-center font-semibold"
      >
        Iniciar sesión
      </Link>
    </div>
  );
};

export default Register;
