const Loading = ({ message = 'Cargando...' }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <div className="spinner" />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
};

export default Loading;
