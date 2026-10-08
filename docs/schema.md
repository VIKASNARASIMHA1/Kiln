# Data model (PostgreSQL)

The full DDL is `server/src/db/schema.sql`. It uses `CREATE ... IF NOT EXISTS`, so the API runs it on every start (and `npm run migrate` runs it by hand). All ids are UUIDs. JSON columns are `jsonb`.

| Table | Columns (besides `id`) | Notes |
|---|---|---|
| `users` | name, email, password_hash, role (`student`/`teacher`/`admin`), track (`python`/`web`/`ml`), is_demo, is_simulated, last_active_at, **stats** (jsonb), created_at, updated_at | Email is unique, ignoring case (`lower(email)` index). `stats` holds avgQuizScore, quizzesTaken, lessonsCompleted, streakDays, avgSessionMinutes, daysSinceLastActive, tutorQuestions, hintRequests, exercisesSolved, weeklyEngagement[]. |
| `courses` | title, slug (unique), track, description, sort_order | |
| `lessons` | course_id, track, title, slug (unique), sort_order, difficulty (1-3), topics (text[]), body (markdown), questions (jsonb) | `questions` is the quiz question bank. It contains answers, so it is never sent to learners as is. |
| `chunks` | lesson_id, track, title, text, sort_order | Search index for the tutor (BM25). Rebuilt by `npm run ingest`. |
| `progress` | user_id, lesson_id, completed, best_score, attempts | Unique per user and lesson. |
| `quiz_attempts` | user_id, lesson_id, questions (jsonb, with answers), answers (jsonb), score, submitted, source (`llm`/`bank`) | A quiz can be submitted only once; the update is conditional, so two quick clicks cannot both count. |
| `chat_sessions` | user_id, lesson_id (nullable), messages (jsonb: role, content, sources[], createdAt) | New messages are appended with `messages || $1`. |
| `exercises` | lesson_id, slug (unique), title, sort_order, difficulty, prompt, function_name, starter, visible_tests (jsonb), hidden_tests (jsonb), hints (jsonb) | Tests are `[{args, expected}]`. Hidden tests are never selected by the learner-facing queries. |
| `exercise_progress` | user_id, exercise_id, solved, attempts, best_passed, hints_used, last_code | Unique per user and exercise. |

Deleting a user, lesson or exercise cascades to the rows that depend on it. A chat session whose lesson is deleted keeps its messages and loses the link (`ON DELETE SET NULL`).

JSON note: `jsonb` cannot store the NUL character (`\u0000`). The seed script rejects it in exercise tests with a clear message instead of failing inside the database.
