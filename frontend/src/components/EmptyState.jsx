const EmptyState = ({ icon = '🍽️', title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-2">
      <div className="text-5xl mb-1">{icon}</div>
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};

export default EmptyState;
