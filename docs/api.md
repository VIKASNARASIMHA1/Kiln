# API reference

All routes are under `/api`. Protected routes need `Authorization: Bearer <token>`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | /health | public | Status and which model is in use: `llm` (`live` or `demo`), `provider`, `model`, `local` |
| GET | /llm/status | user | Asks the model service whether it is reachable and the model is installed |
| POST | /auth/register | public | Create a student account |
| POST | /auth/login | public | Sign in |
| POST | /auth/guest | public | One-click demo sign-in (`{role: "student" \| "teacher"}`) |
| GET | /auth/me | user | Current user and learning stats |
| GET | /courses | user | Courses with completion counts |
| GET | /courses/:id | user | Course and its lessons with progress |
| GET | /lessons/:id | user | Lesson text (never includes quiz answers) |
| POST | /lessons/:id/complete | user | Mark complete (idempotent) |
| GET | /progress | user | Lessons in the user's track with progress |
| POST | /quiz/generate | user | Create a quiz `{lessonId}`; answers are withheld |
| POST | /quiz/:attemptId/submit | owner | Grade `{answers: [0-3 or -1]}` |
| POST | /quiz/explain | owner | Explain a wrong answer after submission |
| GET | /recommend/next | user | Next lesson chosen by the RL scheduler, plus related lessons |
| GET | /analytics/overview | teacher | Risk distribution, engagement forecast, at-risk learners |
| GET | /tutor/sessions, /tutor/sessions/:id | user | Chat history |
| GET | /exercises/lesson/:lessonId | user | Exercises for a lesson with solved state |
| GET | /exercises/:id | user | Prompt, starter code, example tests, revealed hints, saved code. Never hidden tests |
| POST | /exercises/:id/run | user | Run code against the example tests only (not an attempt) |
| POST | /exercises/:id/submit | user | Grade against example and hidden tests; may mark the exercise solved |
| POST | /exercises/:id/hint | user | Reveal the next hint (counted in stats) |

## Socket.io (tutor streaming)

Connect with `auth: { token }`. Emit `tutor:ask` with `{ question, lessonId?, sessionId? }`.
Server emits `tutor:start` (sources), `tutor:token` (text chunks), `tutor:done`, or `tutor:error`.

## AI service (internal, FastAPI)

`POST /predict/dropout`, `/predict/dropout/batch`, `/recommend/difficulty`, `/recommend/similar`,
`/forecast/engagement`, `POST /sandbox/grade`, `GET /sandbox/status`, `GET /models/info`, `GET /health`.

`POST /sandbox/grade` takes `{code, function, tests: [{args, expected}], timeout}` and returns per-test results, captured output, and `timedOut`/`crashed` flags. It runs arbitrary code, so never expose the AI service publicly; set `SANDBOX_TOKEN` to require an `X-Sandbox-Token` header. Interactive docs at `:8000/docs`.
