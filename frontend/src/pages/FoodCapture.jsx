import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Image as ImageIcon,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  Trash2,
  Plus,
  AlertTriangle,
  Pencil,
  Star,
  Eye,
} from 'lucide-react';
import { foodApi, frequentApi, getErrorMessage } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { compressImage } from '../utils/imageUtils';
import { MEAL_TYPES, guessMealType, toTimeString, round } from '../utils/nutrition';
import QualityCard from '../components/QualityCard';

const STEPS = {
  PICK: 'pick',
  PREVIEW: 'preview',
  ANALYZING: 'analyzing',
  REVIEW: 'review',
  FREQUENTS: 'frequents',
};

const emptyFood = () => ({
  name: '',
  portion_grams: 0,
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
});

const FoodCapture = () => {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const { goals } = useAuthStore();

  const [step, setStep] = useState(STEPS.PICK);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [saving, setSaving] = useState(false);

  const [mealType, setMealType] = useState(guessMealType());
  const [mealTime, setMealTime] = useState(toTimeString());

  const [foods, setFoods] = useState([]);
  const [confidence, setConfidence] = useState(0);
  const [notes, setNotes] = useState('');
  const [aiTotals, setAiTotals] = useState(null);
  // Micronutrientes estimados por la IA (fibra/azúcares/sodio)
  const [micro, setMicro] = useState({ fiber: 0, sugars: 0, sodium: 0 });

  const [manualMode, setManualMode] = useState(false);
  const [customPlate, setCustomPlate] = useState('');

  // Alimentos frecuentes
  const [saveAsFrequent, setSaveAsFrequent] = useState(false);
  const [frequents, setFrequents] = useState([]);
  const [frequentsLoading, setFrequentsLoading] = useState(false);
  const [loggingFrequentId, setLoggingFrequentId] = useState(null);

  const cameraInput = useRef(null);
  const galleryInput = useRef(null);

  // ---------------------------------------------------------------------
  // Selección y compresión de imagen
  // ---------------------------------------------------------------------
  const handleFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      // Permite volver a elegir el mismo archivo
      event.target.value = '';
      if (!file) return;

      setError(null);
      setErrorCode(null);

      try {
        const { file: compressed, savings } = await compressImage(file);
        setImageFile(compressed);

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(compressed));

        if (savings > 15) {
          addToast(`Imagen optimizada (-${savings}%)`, 'info');
        }

        setStep(STEPS.PREVIEW);
      } catch (err) {
        addToast(err.message || 'No se pudo procesar la imagen', 'error');
      }
    },
    [addToast, previewUrl]
  );

  // ---------------------------------------------------------------------
  // Análisis con IA
  // ---------------------------------------------------------------------
  const runAnalysis = async (customName = null) => {
    if (!imageFile) return;

    setStep(STEPS.ANALYZING);
    setError(null);
    setUploadPct(0);

    try {
      const nameToSend = typeof customName === 'string' ? customName : customPlate;
      const data = await foodApi.analyze(imageFile, (e) => {
        if (e.total) {
          setUploadPct(Math.round((e.loaded / e.total) * 100));
        }
      }, nameToSend);

      const analysis = data.analysis;

      setImageUrl(data.imageUrl);
      setFoods(analysis.foods.length ? analysis.foods : [emptyFood()]);
      setConfidence(analysis.confidence);
      setNotes(analysis.notes);
      setAiTotals({
        calories: analysis.total_calories,
        protein: analysis.total_protein,
        carbs: analysis.total_carbs,
        fats: analysis.total_fats,
        confidence: analysis.confidence,
      });
      setMicro({
        fiber: analysis.fiber || 0,
        sugars: analysis.sugars || 0,
        sodium: analysis.sodium || 0,
      });

      setStep(STEPS.REVIEW);

      if (analysis.needs_review) {
        addToast(
          'La estimación es poco fiable. Revisa y corrige los valores.',
          'warning'
        );
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      setErrorCode(err.response?.data?.code || null);
      setStep(STEPS.PREVIEW);
    }
  };

  // ---------------------------------------------------------------------
  // Edición de alimentos
  // ---------------------------------------------------------------------
  const updateFood = (index, field, value) => {
    setFoods((prev) =>
      prev.map((f, i) =>
        i === index
          ? { ...f, [field]: field === 'name' ? value : Number(value) || 0 }
          : f
      )
    );
  };

  const addFood = () => setFoods((prev) => [...prev, emptyFood()]);

  const removeFood = (index) =>
    setFoods((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  // Totales calculados en vivo a partir de los alimentos editados
  const totals = foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fats: acc.fats + (Number(f.fats) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  // Alimentos con nombre: es "lo que vio la IA" para el resumen visual
  const detected = foods.filter((f) => f.name && f.name.trim() !== '');

  // ---------------------------------------------------------------------
  // Guardado
  // ---------------------------------------------------------------------
  const handleSave = async () => {
    const cleanFoods = foods.filter((f) => f.name.trim() !== '');
    if (cleanFoods.length === 0 && totals.calories === 0) {
      addToast('Añade al menos un alimento o unas calorías', 'warning');
      return;
    }

    setSaving(true);
    try {
      await foodApi.save({
        mealType,
        mealTime,
        foods: cleanFoods,
        totals: {
          ...totals,
          fiber: micro.fiber,
          sugars: micro.sugars,
          sodium: micro.sodium,
        },
        aiTotals,
        imageUrl,
        confirmed: true,
        saveAsFrequent,
      });

      addToast('Comida registrada correctamente', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleManualSave = async () => {
    setSaving(true);
    try {
      await foodApi.createManual({
        mealType,
        mealTime,
        foods: foods.filter((f) => f.name.trim() !== ''),
        totals,
        saveAsFrequent,
      });
      addToast('Comida registrada manualmente', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // Alimentos frecuentes
  // ---------------------------------------------------------------------
  const openFrequents = async () => {
    setError(null);
    setErrorCode(null);
    setStep(STEPS.FREQUENTS);
    setFrequentsLoading(true);
    try {
      const data = await frequentApi.list();
      setFrequents(data.frecuentes || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setFrequentsLoading(false);
    }
  };

  /** Un toque: registra el frecuente en el conteo del día (sin IA). */
  const handleLogFrequent = async (ff) => {
    setLoggingFrequentId(ff.id);
    try {
      await frequentApi.log(ff.id, { mealType, mealTime });
      addToast(`"${ff.name}" registrada correctamente`, 'success');
      navigate('/', { replace: true });
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoggingFrequentId(null);
    }
  };

  const handleDeleteFrequent = async (ff) => {
    try {
      await frequentApi.remove(ff.id);
      setFrequents((prev) => prev.filter((f) => f.id !== ff.id));
      addToast('Alimento frecuente eliminado', 'info');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setImageUrl(null);
    setFoods([]);
    setNotes('');
    setConfidence(0);
    setAiTotals(null);
    setMicro({ fiber: 0, sugars: 0, sodium: 0 });
    setError(null);
    setErrorCode(null);
    setManualMode(false);
    setCustomPlate('');
    setSaveAsFrequent(false);
    setStep(STEPS.PICK);
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => (step === STEPS.PICK ? navigate(-1) : reset())}
          className="p-1.5 -ml-1.5 text-gray-600"
          aria-label="Volver"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-semibold text-gray-900">
          {step === STEPS.REVIEW
            ? 'Confirmar análisis'
            : step === STEPS.FREQUENTS
              ? 'Alimentos frecuentes'
              : 'Registrar comida'}
        </h1>
      </header>

      {/* Inputs ocultos */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {/* ---------------- PASO 1: elegir origen ---------------- */}
      {step === STEPS.PICK && (
        <div className="px-5 py-8 flex flex-col gap-4">
          <div className="text-center mb-2">
            <div className="text-5xl mb-3">🍽️</div>
            <h2 className="font-semibold text-gray-900 text-lg">
              ¿Qué vas a registrar?
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Haz una foto de tu plato o de la tabla nutricional de un envase y
              la IA estimará las calorías y los macronutrientes.
            </p>
          </div>

          <button
            onClick={() => cameraInput.current?.click()}
            className="card p-5 flex items-center gap-4 active:bg-gray-50"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 shrink-0">
              <Camera size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Tomar foto</p>
              <p className="text-xs text-gray-500">
                Plato o etiqueta nutricional
              </p>
            </div>
          </button>

          <button
            onClick={() => galleryInput.current?.click()}
            className="card p-5 flex items-center gap-4 active:bg-gray-50"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
              <ImageIcon size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Subir de galería</p>
              <p className="text-xs text-gray-500">
                Elige una foto ya guardada
              </p>
            </div>
          </button>

          <button
            onClick={openFrequents}
            className="card p-5 flex items-center gap-4 active:bg-gray-50"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Star size={24} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Frecuentes</p>
              <p className="text-xs text-gray-500">
                Registra una comida guardada en un toque
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              setFoods([emptyFood()]);
              setManualMode(true);
              setStep(STEPS.REVIEW);
            }}
            className="text-sm text-gray-500 underline mt-2"
          >
            Introducir los datos manualmente
          </button>
        </div>
      )}

      {/* ---------------- PASO 2: preview ---------------- */}
      {step === STEPS.PREVIEW && (
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="card overflow-hidden">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Previsualización"
                className="w-full max-h-80 object-contain bg-black"
              />
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-800">
                  No pudimos analizar la imagen
                </p>
                <p className="text-red-700 mt-0.5">{error}</p>
                {errorCode === 'VISION_UNSUPPORTED' && (
                  <p className="text-red-600 text-xs mt-2">
                    El administrador debe configurar un modelo multimodal en el
                    backend.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                <Pencil size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  ¿Querés darle una pista a Ani?
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                  Opcional. Escribí qué es y lo tendrá en cuenta al estimar las
                  porciones y los macros.
                </p>
              </div>
            </div>
            <input
              type="text"
              value={customPlate}
              onChange={(e) => setCustomPlate(e.target.value)}
              placeholder="Ej: Milanesa con puré · Yogur (tabla nutricional)"
              className="input text-sm"
            />
          </div>

          <button
            onClick={() => runAnalysis()}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            {error ? 'Reintentar análisis' : 'Analizar con IA'}
          </button>

          <button
            onClick={() => {
              setFoods([emptyFood()]);
              setManualMode(true);
              setStep(STEPS.REVIEW);
            }}
            className="btn btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Pencil size={16} /> Cargar datos manualmente
          </button>

          <button onClick={reset} className="text-sm text-gray-500 underline">
            Elegir otra imagen
          </button>
        </div>
      )}

      {/* ---------------- PASO 3: analizando ---------------- */}
      {step === STEPS.ANALYZING && (
        <div className="px-5 py-16 flex flex-col items-center gap-5 text-center">
          <div className="spinner" />
          <div>
            <p className="font-semibold text-gray-900">
              Analizando tu plato…
            </p>
            <p className="text-sm text-gray-500 mt-1">
              La IA está identificando los alimentos y estimando los valores
              nutricionales.
            </p>
          </div>
          {uploadPct > 0 && uploadPct < 100 && (
            <div className="w-full max-w-xs">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadPct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Subiendo imagen… {uploadPct}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- PASO 4: revisión ---------------- */}
      {step === STEPS.REVIEW && (
        <div className="px-4 py-5 flex flex-col gap-4">
          {previewUrl && !manualMode && (
            <div className="card overflow-hidden">
              <img
                src={previewUrl}
                alt="Comida analizada"
                className="w-full max-h-52 object-contain bg-black"
              />
            </div>
          )}

          {/* Lo que vio la IA, de un vistazo */}
          {!manualMode && (
            <section className="card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                    <Eye size={16} />
                  </div>
                  <h2 className="font-semibold text-gray-900 text-sm">
                    Esto es lo que vio Ani
                  </h2>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    confidence >= 70
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {Math.round(confidence)}%
                </span>
              </div>

              {detected.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detected.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-baseline gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs"
                    >
                      <span className="font-semibold text-gray-800">
                        {f.name}
                      </span>
                      {Number(f.portion_grams) > 0 && (
                        <span className="text-gray-500">
                          {round(f.portion_grams)} g
                        </span>
                      )}
                      {Number(f.calories) > 0 && (
                        <span className="text-gray-400">
                          {round(f.calories)} kcal
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  No reconoció alimentos en la foto. Podés cargarlos a mano
                  abajo.
                </p>
              )}

              {notes && (
                <p className="text-[11px] text-gray-500 leading-relaxed border-l-2 border-gray-200 pl-3">
                  {notes}
                </p>
              )}

              <p
                className={`text-[11px] rounded-lg px-3 py-2 leading-relaxed ${
                  confidence >= 70
                    ? 'bg-green-50 text-green-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {confidence >= 70
                  ? 'Si algo no coincide, corregilo abajo: los totales se recalculan solos.'
                  : 'Estimación poco fiable. Revisá las porciones y los valores antes de guardar.'}
              </p>
            </section>
          )}

          {/* Alimentos: lo que se va a registrar, editable */}
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-800 text-sm">
                  Revisá y editá
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Tocá cualquier valor para corregirlo.
                </p>
              </div>
              <button
                onClick={addFood}
                className="text-xs text-primary-600 font-semibold flex items-center gap-1 shrink-0"
              >
                <Plus size={13} /> Añadir
              </button>
            </div>

            {foods.map((food, index) => (
              <div
                key={index}
                className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2 bg-gray-50/50"
              >
                <div className="flex gap-2 items-center">
                  <input
                    value={food.name}
                    onChange={(e) => updateFood(index, 'name', e.target.value)}
                    placeholder="Nombre del alimento"
                    className="input !py-2 !text-sm flex-1"
                  />
                  <button
                    onClick={() => removeFood(index)}
                    disabled={foods.length === 1}
                    className="p-2 text-gray-400 disabled:opacity-30"
                    aria-label="Quitar alimento"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { key: 'portion_grams', label: 'g' },
                    { key: 'calories', label: 'kcal' },
                    { key: 'protein', label: 'P' },
                    { key: 'carbs', label: 'C' },
                    { key: 'fats', label: 'G' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex flex-col">
                      <span className="text-[10px] text-gray-400 text-center">
                        {label}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={food[key]}
                        onChange={(e) => updateFood(index, key, e.target.value)}
                        className="input !py-1.5 !px-1 !text-xs text-center"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {detected.length === 0 && (
              <div className="bg-amber-50 text-amber-800 text-xs rounded-lg px-3 py-2 leading-relaxed">
                No hay alimentos con nombre. Escribí al menos uno, o cargá las
                calorías totales.
              </div>
            )}
          </div>

          {/* Tipo de comida y hora */}
          <div className="card p-4 flex flex-col gap-3">
            <div>
              <span className="text-sm font-medium text-gray-700">
                Tipo de comida
              </span>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {MEAL_TYPES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMealType(m.value)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-medium ${
                      mealType === m.value
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className="text-base">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Hora</span>
              <input
                type="time"
                value={mealTime}
                onChange={(e) => setMealTime(e.target.value)}
                className="input"
              />
            </label>
          </div>

          {/* Totales */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-800 text-sm mb-3">
              Totales
            </h2>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-gray-600 text-sm">Calorías</span>
              <span className="text-2xl font-bold text-primary-600">
                {round(totals.calories)}{' '}
                <span className="text-sm font-normal text-gray-400">kcal</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Proteínas', value: totals.protein, color: 'text-blue-600' },
                { label: 'Carbos', value: totals.carbs, color: 'text-amber-600' },
                { label: 'Grasas', value: totals.fats, color: 'text-red-500' },
              ].map((m) => (
                <div key={m.label} className="bg-gray-50 rounded-lg py-2">
                  <p className={`font-bold ${m.color}`}>{round(m.value)}g</p>
                  <p className="text-[11px] text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>
            {goals && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                Tu objetivo diario: {goals.calorieGoal} kcal ·{' '}
                {goals.proteinGoal}g proteína
              </p>
            )}
          </div>

          {/* Micronutrientes y calidad (solo con el análisis de IA) */}
          {!manualMode && (
            <QualityCard
              fiber={micro.fiber}
              sugars={micro.sugars}
              sodium={micro.sodium}
              scope="dish"
            />
          )}

          {/* Corrección avanzada: volver a analizar con otro nombre.
              Va plegada: es una acción secundaria y así no ensucia la pantalla. */}
          {!manualMode && (
            <details className="card p-4">
              <summary className="text-sm font-semibold text-gray-800 cursor-pointer flex items-center gap-1.5">
                <Sparkles size={15} className="text-primary-600" />
                ¿No es nada de esto? Volver a analizar
              </summary>
              <div className="flex flex-col gap-2 mt-3">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Escribí el plato real (ej: reconoció fideos de huevo pero es
                  una tarta de atún) y Ani vuelve a estimar los ingredientes y
                  los macros a partir de la misma foto.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPlate}
                    onChange={(e) => setCustomPlate(e.target.value)}
                    placeholder="Ej: Tarta de atún con cebolla"
                    className="input text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => runAnalysis(customPlate)}
                    disabled={!customPlate.trim()}
                    className="btn btn-secondary text-xs py-2.5 px-4 whitespace-nowrap disabled:opacity-50"
                  >
                    Re-analizar
                  </button>
                </div>
              </div>
            </details>
          )}

          {/* Guardar como frecuente */}
          <label
            className={`card p-4 flex items-center gap-3 cursor-pointer ${
              saveAsFrequent ? 'border-primary-600' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={saveAsFrequent}
              onChange={(e) => setSaveAsFrequent(e.target.checked)}
              className="h-5 w-5 accent-primary-600 shrink-0"
            />
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                saveAsFrequent ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Star size={20} fill={saveAsFrequent ? 'currentColor' : 'none'} />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">
                Añadir a frecuentes
              </p>
              <p className="text-xs text-gray-500">
                La próxima vez podrás registrarla en un toque, sin análisis de IA.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* ---------------- PASO 5: alimentos frecuentes ---------------- */}
      {step === STEPS.FREQUENTS && (
        <div className="px-5 py-6 flex flex-col gap-4">
          <div className="text-center mb-2">
            <div className="text-5xl mb-3">⭐</div>
            <h2 className="font-semibold text-gray-900 text-lg">
              Tus alimentos frecuentes
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Toca uno para registrarlo en el conteo del día, sin pasar por la IA.
            </p>
          </div>

          {frequentsLoading ? (
            <div className="flex justify-center py-10">
              <div className="spinner" />
            </div>
          ) : frequents.length === 0 ? (
            <div className="card p-6 text-center text-sm text-gray-500 leading-relaxed">
              Todavía no tienes alimentos frecuentes.
              <br />
              Guarda uno marcando la estrella al confirmar una comida.
            </div>
          ) : (
            frequents.map((ff) => (
              <div key={ff.id} className="card p-4 flex items-center gap-3">
                <button
                  onClick={() => handleLogFrequent(ff)}
                  disabled={loggingFrequentId !== null}
                  className="flex-1 flex flex-col gap-1 text-left disabled:opacity-50"
                >
                  <p className="font-semibold text-gray-900 text-sm">
                    {ff.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {Math.round(ff.totals.calories)} kcal · P{' '}
                    {Math.round(ff.totals.protein)} · C{' '}
                    {Math.round(ff.totals.carbs)} · G{' '}
                    {Math.round(ff.totals.fats)}
                  </p>
                  {loggingFrequentId === ff.id && (
                    <span className="text-xs text-primary-600">
                      Registrando…
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleDeleteFrequent(ff)}
                  disabled={loggingFrequentId !== null}
                  className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30"
                  aria-label={`Eliminar ${ff.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Botón flotante de guardado */}
      {step === STEPS.REVIEW && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-bottom">
          <div className="flex gap-3">
            <button
              onClick={
                manualMode && !imageUrl && !previewUrl
                  ? handleManualSave
                  : handleSave
              }
              disabled={saving}
              className="btn btn-primary flex-1 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar comida'}
            </button>
            <button onClick={reset} className="btn btn-secondary px-4">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoodCapture;
