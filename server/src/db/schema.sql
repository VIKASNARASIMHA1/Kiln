-- Kiln schema. Every statement is idempotent, so it is safe to run on every start.
-- Requires PostgreSQL 13+ (gen_random_uuid is built in). Neon runs 15+.

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  email           text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  track           text NOT NULL DEFAULT 'python' CHECK (track IN ('python', 'web', 'ml')),
  is_demo         boolean NOT NULL DEFAULT false,
  is_simulated    boolean NOT NULL DEFAULT false,
  stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TABLE IF NOT EXISTS courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  track       text NOT NULL CHECK (track IN ('python', 'web', 'ml')),
  description text,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  track       text NOT NULL,
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  sort_order  integer NOT NULL DEFAULT 0,
  difficulty  integer NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  topics      text[] NOT NULL DEFAULT '{}',
  body        text NOT NULL,
  questions   jsonb NOT NULL DEFAULT '[]'::jsonb   -- [{prompt, options[4], answer 0-3, explanation}]
);
CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons (course_id);
CREATE INDEX IF NOT EXISTS lessons_track_idx ON lessons (track);

CREATE TABLE IF NOT EXISTS chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  track       text,
  title       text,
  text        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chunks_lesson_idx ON chunks (lesson_id);

CREATE TABLE IF NOT EXISTS progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lesson_id   uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  completed   boolean NOT NULL DEFAULT false,
  best_score  double precision,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lesson_id   uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  score       double precision,
  submitted   boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'bank' CHECK (source IN ('llm', 'bank')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lesson_id   uuid REFERENCES lessons (id) ON DELETE SET NULL,
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content, sources[], createdAt}]
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_sessions_user_idx ON chat_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS exercises (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  slug           text NOT NULL UNIQUE,
  title          text NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  difficulty     integer NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  prompt         text NOT NULL,
  function_name  text NOT NULL,
  starter        text NOT NULL,
  visible_tests  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{args, expected}] shown to the learner
  hidden_tests   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- never leave the server
  hints          jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS exercises_lesson_idx ON exercises (lesson_id);

CREATE TABLE IF NOT EXISTS exercise_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  solved       boolean NOT NULL DEFAULT false,
  attempts     integer NOT NULL DEFAULT 0,
  best_passed  integer NOT NULL DEFAULT 0,
  hints_used   integer NOT NULL DEFAULT 0,
  last_code    text NOT NULL DEFAULT '' CHECK (char_length(last_code) <= 10000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id)
);
