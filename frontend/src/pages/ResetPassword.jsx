import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { getErrorMessage } from '../services/api';

/**
 * Elegir la contraseña nueva a partir del token del enlace.
 *
 * El token viaja en la URL (?token=...). Si falta o el backend lo rechaza, se
 * ofrece pedir un enlace nuevo en lugar de dejar al usuario en un callejón.
 */
const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [ver, setVer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== repetir) {
      setError('Las dos contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setListo(true);
      // Se entra directamente: ya ha demostrado que controla el email
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Sin token en la URL no hay nada que hacer
  if (!token) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-primary-50 to-white text-center">
        <AlertTriangle size={48} className="text-amber-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Enlace incompleto</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          Este enlace no trae el código de restablecimiento. Pide uno nuevo.
        </p>
        <Link to="/recuperar" className="btn btn-primary w-full block text-center">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-primary-50 to-white text-center">
        <CheckCircle2 size={48} className="text-primary-600 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-900">
          Contraseña actualizada
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Ya puedes iniciar sesión con tu nueva contraseña.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-primary-50 to-white">
      <div className="text-center mb-8">
        <div className="text-5xl mb-2">🔐</div>
        <h1 className="text-xl font-bold text-gray-900">Nueva contraseña</h1>
        <p className="text-sm text-gray-500 mt-1">
          Elige una contraseña que no uses en otro sitio.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            Contraseña nueva
          </span>
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type={ver ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input !pl-10 !pr-10"
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {ver ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            Repítela
          </span>
          <div className="relative">
            <Lock
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type={ver ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              className="input !pl-10"
            />
          </div>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
            {error.toLowerCase().includes('caducado') && (
              <>
                {' '}
                <Link to="/recuperar" className="font-semibold underline">
                  Pedir uno nuevo
                </Link>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full mt-2 disabled:opacity-60"
        >
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
};

export default ResetPassword;
