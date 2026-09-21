import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import FoodCapture from './pages/FoodCapture';
import History from './pages/History';
import Profile from './pages/Profile';
import Recommendations from './pages/Recommendations';
import InstallPrompt from './components/InstallPrompt';
import UpdatePrompt from './components/UpdatePrompt';
import InAppBrowserNotice from './components/InAppBrowserNotice';
import Toasts from './components/Toasts';
import Loading from './components/Loading';
import { useUIStore } from './store/uiStore';
import { aplicarActualizacion } from './utils/pwa';

function App() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const updateAvailable = useUIStore((s) => s.updateAvailable);
  const dismissUpdate = useUIStore((s) => s.dismissUpdate);

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return <Loading message="Iniciando NutriTrack..." />;
  }

  const guard = (element) =>
    isAuthenticated ? element : <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Va arriba del todo: si el usuario llega desde WhatsApp, tiene que
          enterarse antes de intentar usar la cámara o instalar la app. */}
      <InAppBrowserNotice />

      <Routes>
        {/* Rutas públicas */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Register />}
        />

        {/* Recuperación de contraseña: siempre accesible, incluso con sesión
            iniciada. Si alguien tiene la sesión abierta pero no recuerda su
            contraseña, necesita poder llegar aquí. */}
        <Route path="/recuperar" element={<ForgotPassword />} />
        <Route path="/restablecer" element={<ResetPassword />} />

        {/* Rutas protegidas */}
        <Route path="/" element={guard(<Home />)} />
        <Route path="/food" element={guard(<FoodCapture />)} />
        <Route path="/history" element={guard(<History />)} />
        <Route path="/profile" element={guard(<Profile />)} />
        <Route path="/recommendations" element={guard(<Recommendations />)} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <InstallPrompt />
      <UpdatePrompt
        visible={updateAvailable}
        onUpdate={aplicarActualizacion}
        onDismiss={dismissUpdate}
      />
      <Toasts />
    </div>
  );
}

export default App;
