import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { getMealIcon, getMealLabel, formatTime, round } from '../utils/nutrition';

/**
 * Tarjeta de un registro de comida en el listado diario.
 */
const FoodEntryCard = ({ entry, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    calories: round(entry.calories),
    protein: round(entry.protein),
    carbs: round(entry.carbs),
    fats: round(entry.fats),
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(entry.id, {
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fats: Number(form.fats) || 0,
      confirmed: true,
    });
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="card p-3">
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
          {entry.image_url ? (
            <img
              src={entry.image_url}
              alt={getMealLabel(entry.meal_type)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-2xl">{getMealIcon(entry.meal_type)}</span>
          )}
        </div>

        {/* Detalle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-gray-900">
              {getMealIcon(entry.meal_type)} {getMealLabel(entry.meal_type)}
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {formatTime(entry.created_at)}
            </span>
          </div>

          {!editing ? (
            <>
              <p className="text-lg font-bold text-primary-600 leading-tight">
                {round(entry.calories)} kcal
              </p>
              <p className="text-xs text-gray-500">
                P {round(entry.protein)}g · C {round(entry.carbs)}g · G{' '}
                {round(entry.fats)}g
              </p>
              {Array.isArray(entry.foods) && entry.foods.length > 0 && (
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {entry.foods.map((f) => f.name).filter(Boolean).join(', ')}
                </p>
              )}
              {!entry.confirmed_at && (
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  Estimado por IA · sin confirmar
                </span>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { key: 'calories', label: 'kcal' },
                { key: 'protein', label: 'Prot (g)' },
                { key: 'carbs', label: 'Carb (g)' },
                { key: 'fats', label: 'Gras (g)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex flex-col">
                  <span className="text-[10px] text-gray-400">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={handleChange(key)}
                    className="input !py-1 !px-2 !text-sm"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
        {editing ? (
          <>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1"
            >
              <X size={13} /> Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={13} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1"
            >
              <Pencil size={13} /> Editar
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 flex items-center gap-1"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FoodEntryCard;
