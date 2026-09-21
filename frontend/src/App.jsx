import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import FoodCapture from './pages/FoodCapture';
import History from './pages/History';
import Profile from './pages/Profile';
import Recommendations from './pages/Recommendations';
import InstallPrompt from './components/InstallPrompt';
import Toasts from './components/Toasts';
import Loading from './components/Loading';

function App() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

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
      <Toasts />
    </div>
  );
}

export default App;
