import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, MailCheck, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api, { getErrorMessage } from '../services/api';

/**
 * Pedir el enlace de restablecimiento.
 *
 * La respuesta es siempre la misma exista o no la cuenta: si dijera "ese email
 * no está registrado", se podría usar este formulario para averiguar qué
 * direcciones tienen cuenta.
 */
const ForgotPassword = () => {
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [hint, setHint] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post('/auth/forgot-password', {
        email: email.trim(),
      });
      setEnviado(true);
      // En desarrollo, si no hay SMTP, el backend avisa de que el enlace está
      // en la consola del servidor.
      if (data.devHint) setHint(data.devHint);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 bg-gradient-to-b from-primary-50 to-white">
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 mb-6 self-start"
      >
        <ArrowLeft size={16} /> Volver
      </Link>

      {!enviado ? (
        <>
          <div className="text-center mb-8">
            <div className="text-5xl mb-2">🔑</div>
            <h1 className="text-xl font-bold text-gray-900">
              Recuperar contraseña
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Te enviaremos un enlace para elegir una nueva.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">
                Tu email
              </span>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input !pl-10"
                />
              </div>
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full disabled:opacity-60"
            >
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="text-center mb-6">
            <MailCheck size={48} className="text-primary-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-gray-900">Revisa tu correo</h1>
            <p className="text-sm text-gray-500 mt-2">
              Si <span className="font-medium text-gray-700">{email}</span> tiene
              una cuenta, te hemos enviado un enlace para restablecer la
              contraseña.
            </p>
            <p className="text-xs text-gray-400 mt-3">
              El enlace caduca en una hora y solo puede usarse una vez.
            </p>
          </div>

          {hint && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2 mb-4">
              <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">{hint}</p>
            </div>
          )}

          <Link to="/login" className="btn btn-secondary w-full text-center block">
            Volver al inicio de sesión
          </Link>
        </>
      )}
    </div>
  );
};

export default ForgotPassword;
