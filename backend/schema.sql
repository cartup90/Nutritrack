-- ============================================================================
-- NutriTrack — Esquema de base de datos (PostgreSQL)
-- Ejecutar con:  psql "$DATABASE_URL" -f schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36) PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    name            VARCHAR(255),
    age             INTEGER CHECK (age IS NULL OR (age > 0 AND age < 130)),
    gender          VARCHAR(20) CHECK (gender IS NULL OR gender IN ('male', 'female')),
    height          NUMERIC(5,2) CHECK (height IS NULL OR height > 0),
    weight          NUMERIC(5,2) CHECK (weight IS NULL OR weight > 0),
    activity_level  VARCHAR(20) NOT NULL DEFAULT 'sedentary'
                    CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
    goal            VARCHAR(20) NOT NULL DEFAULT 'maintain'
                    CHECK (goal IN ('lose_weight','maintain','gain_muscle')),
    -- Intensidad del objetivo: leve / moderado / agresivo
    goal_intensity  VARCHAR(20) NOT NULL DEFAULT 'moderate'
                    CHECK (goal_intensity IN ('mild','moderate','aggressive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración para bases creadas antes de existir `goal_intensity`.
-- (CREATE TABLE IF NOT EXISTS no añade columnas a una tabla ya creada.)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS goal_intensity VARCHAR(20) NOT NULL DEFAULT 'moderate';

-- ---------------------------------------------------------------------------
-- Registros de comida
-- Se guardan los valores estimados por IA (ai_*) y los finales del usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_entries (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meal_type       VARCHAR(20) NOT NULL DEFAULT 'lunch'
                    CHECK (meal_type IN ('breakfast','lunch','snack','dinner')),
    meal_time       TIME,
    foods           JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Valores finales (confirmados por el usuario)
    calories        NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein         NUMERIC(7,2) NOT NULL DEFAULT 0,
    carbs           NUMERIC(7,2) NOT NULL DEFAULT 0,
    fats            NUMERIC(7,2) NOT NULL DEFAULT 0,
    fiber           NUMERIC(7,2),
    sugars          NUMERIC(7,2),
    sodium          NUMERIC(8,2),

    -- Valores originales estimados por IA (trazabilidad)
    ai_calories     NUMERIC(8,2),
    ai_protein      NUMERIC(7,2),
    ai_carbs        NUMERIC(7,2),
    ai_fats         NUMERIC(7,2),
    ai_confidence   NUMERIC(5,2),

    image_url       TEXT,
    estimated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Restablecimiento de contraseña
--
-- Se guarda el HASH del token, nunca el token en claro: si alguien accediera a
-- la base de datos no podría usarlo para cambiar contraseñas.
-- Los tokens son de un solo uso (`used_at`) y caducan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
    ON password_reset_tokens (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Caché de recomendaciones
--
-- Evita volver a llamar a la IA (y volver a gastar tokens) cuando el usuario
-- abre la pantalla de recomendaciones varias veces sin que nada haya cambiado.
-- La clave incluye el día, el objetivo y los totales consumidos, de modo que
-- registrar una comida la invalida automáticamente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendation_cache (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cache_key   VARCHAR(255) NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recommendation_cache UNIQUE (user_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_cache_user
    ON recommendation_cache (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email            ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_type ON food_entries (user_id, meal_type);
CREATE INDEX IF NOT EXISTS idx_food_entries_foods     ON food_entries USING GIN (foods);

-- ---------------------------------------------------------------------------
-- Trigger para mantener updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_food_entries_updated_at ON food_entries;
CREATE TRIGGER trg_food_entries_updated_at
    BEFORE UPDATE ON food_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE users        IS 'Usuarios registrados y sus datos antropométricos';
COMMENT ON TABLE food_entries IS 'Registros de comidas con estimación IA y valores confirmados';
COMMENT ON COLUMN food_entries.ai_calories IS 'Estimación original de la IA (para trazabilidad)';

-- ---------------------------------------------------------------------------
-- Agua
--
-- Se guardan los registros individuales, no un total por día: así se puede
-- deshacer un vaso mal anotado y el histórico queda completo. El total del día
-- se suma al consultar, igual que en las comidas.
--
-- Igual que `food_entries`, `created_at` guarda el instante real en UTC y el
-- día al que pertenece lo decide la aplicación según la zona del usuario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS water_logs (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Un vaso normal son 200-250 ml; 5000 es un tope de cordura
    amount_ml       INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
    ON water_logs (user_id, created_at DESC);

-- Meta diaria de agua. Editable desde el perfil; 2 L por defecto.
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER NOT NULL DEFAULT 2000;

-- ---------------------------------------------------------------------------
-- Recordatorios de agua — OPCIONALES, desactivados por defecto
--
-- `water_reminder_times` es un array JSON de horas locales 'HH:MM' elegidas por
-- el usuario (p. ej. ["09:00","13:00","18:00"]). El planificador las compara
-- con la hora local de CADA usuario usando `timezone`.
--
-- `timezone` la envía el navegador; sin ella se cae en APP_TIMEZONE, igual que
-- para el día lógico de las comidas.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS water_reminder_times JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);

-- ---------------------------------------------------------------------------
-- Suscripciones push
--
-- Un usuario puede tener varias (móvil + escritorio). `endpoint` es UNIQUE: si
-- el mismo dispositivo vuelve a suscribirse se actualiza en vez de duplicar,
-- que es justo lo que pasa al reinstalar la PWA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    -- Claves del cifrado del payload, tal como las entrega el navegador
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    user_agent      VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Registro de recordatorios ya enviados
--
-- El planificador corre cada minuto. Si el proceso se reinicia justo en el
-- minuto del aviso, o tarda más de un minuto, podría enviarlo dos veces. La
-- clave primaria lo hace idempotente: el segundo INSERT falla y no se envía.
-- De paso queda un histórico de cuándo se avisó.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS water_reminder_log (
    user_id         VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_date   DATE NOT NULL,
    reminder_time   VARCHAR(5) NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, reminder_date, reminder_time)
);

-- ---------------------------------------------------------------------------
-- Índices de los recordatorios
-- ---------------------------------------------------------------------------
-- El planificador pregunta "¿quién tiene recordatorios activos?" cada minuto:
-- un índice parcial mantiene esa consulta diminuta aunque haya muchos usuarios.
CREATE INDEX IF NOT EXISTS idx_users_water_reminder
    ON users (id) WHERE water_reminder_enabled;

-- Trigger para mantener updated_at también en water_logs
DROP TRIGGER IF EXISTS trg_water_logs_updated_at ON water_logs;
CREATE TRIGGER trg_water_logs_updated_at
    BEFORE UPDATE ON water_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE water_logs IS 'Vasos de agua registrados; el total del día se suma al consultar';
COMMENT ON TABLE push_subscriptions IS 'Suscripciones Web Push (una por dispositivo)';
COMMENT ON TABLE water_reminder_log IS 'Evita enviar dos veces el mismo recordatorio';
