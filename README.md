# Kiln

An adaptive learning platform for IT skills. A React and Express web app on PostgreSQL (Neon), with a Python AI service: a tutor that answers from course notes and streams its replies, quizzes that adapt to how you score, and a teacher dashboard that predicts who is about to drop out.

> **Portfolio project.** All learners, scores and activity in the demo are simulated. Models are trained on simulated data, so their accuracy figures describe the simulation, not real students.

![Sign in](docs/screenshots/1_login.png)
![Dashboard](docs/screenshots/2_dashboard.png)
![Dashboard in dark mode](docs/screenshots/8_dashboard_dark.png)

## Try it without signing up

Click **Try the student demo** or **Try the teacher demo** on the login page.

## Architecture

```mermaid
flowchart LR
  C[React client] -- REST + Socket.io --> S[Express API]
  S --> M[(PostgreSQL / Neon)]
  S -- HTTP --> A[FastAPI AI service]
  S -- streaming --> L[LLM API]
```

The browser only talks to the Express API. The API handles auth and data, calls the LLM for the tutor and quiz agent, and calls the AI service for predictions, recommendations and forecasts. If the AI service is down, the API falls back to simple rules and says so in the UI. If no LLM key is set, the app runs in demo mode.

The same diagram is in `docs/architecture.png`.

## What each AI feature really does

| Feature | Implementation |
|---|---|
| Course tutor (RAG) | Lessons are chunked and indexed; a question retrieves the best chunks with **BM25 keyword ranking**, then the LLM answers from them with numbered citations. Replies stream token by token over Socket.io. |
| Quiz agent | The LLM writes questions from the lesson as JSON. Output is **validated** (4 distinct options, valid answer index); invalid output falls back to a hand-written question bank. A second call explains a learner's specific mistake. |
| Dropout predictor | Logistic regression on 8 engagement features, with per-learner top drivers computed from coefficients. Trained on simulated data. |
| Exercise scheduler | **Tabular Q-learning** trained in a simulated student environment; it chooses a difficulty level from the learner's skill bucket. |
| Related lessons | TF-IDF cosine similarity between a learner's completed lessons and the rest. |
| Coding exercises | Learners write Python in a browser editor (CodeMirror), **Run** the example tests, and **Submit** to be graded against hidden tests. Code runs in a separate, resource-limited sandbox process (see below). Hints are revealed one at a time and counted in the learner's stats. |
| Engagement forecast | Holt linear-trend exponential smoothing with a grid search over the smoothing parameters. |

Retrieval check (`npm run eval:rag`): the right lesson is the top result for 26 of 27 quiz questions and in the top 3 for all 27. The questions come from the same lessons, so this confirms the wiring and keyword coverage, not real-world performance.


## Design and dark mode

Flat colour blocks, bold outlines and hard offset shadows. Colour carries meaning: each track owns a hue (Python blue, web coral, machine learning violet), difficulty runs mint, sun, coral, and solved or failed use mint and coral.

**Logo.** A brick kiln seen from the front: a navy dome, an arched firing door glowing sun-yellow and one coral flame, on an orange tile (`client/src/components/Logo.tsx`; the favicon in `client/index.html` is the same mark).

**Sign in and sign up.** One centred page. The form sits in an arched "kiln door" card with a Sign in / Create account switch, a show-password button, and coloured track chips on sign-up. The row of tiles along the bottom warms up once, left to right, and stays still for people who prefer reduced motion.

![Create account](docs/screenshots/1b_signup.png)

**Dark mode.** A switch in the sidebar (and on the login page) toggles the theme. With no saved choice the app follows your operating system and updates live; once you choose, your choice is kept in `localStorage` (and the app still works if storage is blocked). A tiny script in `index.html` sets the theme before first paint, so dark-mode users never see a light flash. The code editor and the charts follow the theme too.

All colours are CSS variables at the top of `client/src/index.css`, one set per theme. After changing any of them run `python client/scripts/check-contrast.py`: it checks 39 text and UI pairings per theme against WCAG contrast targets (4.5:1 for text, 3:1 for icons and focus rings). Charts need real colour values, so their palette is mirrored in `client/src/components/Charts.tsx`; update both.

![Exercise page in dark mode](docs/screenshots/9_exercise_dark.png)

## Language model options

The tutor, AI-written quizzes and quiz explanations need a language model. Pick one in `.env` with `LLM_PROVIDER`:

| Provider | Cost | Setup |
|---|---|---|
| (empty) | free | **Demo mode.** The tutor shows matching lesson passages and quizzes come from the built-in question bank. |
| `ollama` | **free** | Runs an open model on your own computer, offline. Install [Ollama](https://ollama.com), run `ollama pull llama3.2`, set `LLM_PROVIDER=ollama`. Models of about 3 billion parameters need roughly 8 GB of RAM on a CPU; check the Ollama model pages for current sizes. |
| `anthropic` | paid | Claude through the Anthropic API. Set `ANTHROPIC_API_KEY` (and add account credits). |
| `openai` | varies | Any OpenAI-compatible service: LM Studio, or hosted services (some have free tiers; check their current limits). Set `LLM_BASE_URL`, `LLM_MODEL` and, for hosted services, `LLM_API_KEY`. |

Check your setup with `cd server && npm run check:llm`. It tells you whether the service is reachable, whether the model is installed, and how long the first answer takes. The API also prints the model in use when it starts, and the tutor shows it under the chat box.

Local models are slower and less reliable than hosted ones, so the app compensates:

- **Waiting is about progress, not total time.** The app waits up to 3 minutes for the first word (the model may still be loading) and then allows 60 seconds of silence, so a slow computer that is working is not cut off. A truly stuck model is stopped with a clear message.
- **The model loads when the API starts** (`OLLAMA_WARMUP=1`) and stays in memory for 30 minutes after each use (`OLLAMA_KEEP_ALIVE`), so normally only the very first question after a restart is slow.
- **Shorter prompts and answers:** with a local model the tutor sends 2 lesson passages instead of 3 and asks for answers under 120 words.
- **Quizzes use the built-in question bank by default**, because a small model writing JSON is slow and unreliable. Set `QUIZ_USE_LLM=1` to have the model write them (3 questions, JSON mode, validated, with the bank as the fallback after 90 seconds).
- If your computer is still too slow, switch to a smaller model: `ollama pull llama3.2:1b`, then `OLLAMA_MODEL=llama3.2:1b`.

If the model is unavailable the tutor says what to do (for example `ollama pull llama3.2`), and everything else, including quizzes and coding exercises, keeps working.

How this was tested: the provider code is exercised against a fake Ollama and OpenAI-compatible server that follow the documented formats, covering streaming, a JSON line split across network chunks, a missing model, an unreachable service, a hang and a mid-answer failure. It has not been tried against a real model in this repository's test suite, so run `npm run check:llm` on your machine.

## Coding exercises and the sandbox

![Coding exercise](docs/screenshots/7_exercise.png)

11 Python exercises across the three tracks (sum of evens, FizzBuzz, word count, safe parsing, slugify, status codes, query strings, mean squared error, precision and recall, cosine similarity). Each has example tests the learner can see, hidden tests that only run on **Submit**, and three progressive hints.

How a run works: the browser sends code to the Express API, which loads the tests, applies rate limits, and forwards the code to the AI service. The AI service starts a **fresh Python process** per run and returns per-test results. The API then removes everything a learner must not see: hidden tests show only pass or fail, never their inputs, expected values or exception text.

What the sandbox does:

- a separate process with a wall-clock timeout, per-test timers, and the whole process group killed on timeout
- memory, CPU and file-size limits (`resource` limits, Linux and macOS only)
- an empty environment, so learner code cannot read API keys or secrets
- a throwaway working directory that is deleted afterwards
- network, subprocess and `ctypes` modules and `os.system`/`fork`/`exec` blocked
- captured output capped at 4,000 characters, a concurrency cap (503 when busy), a per-user run rate limit, and an optional shared secret (`SANDBOX_TOKEN`) between the API and the AI service

**This is defense in depth, not a hard security boundary.** The blocks are Python-level and a determined attacker can get around them, and learner code can still read files the AI service's user can read. That is fine on your own machine. Before exposing the app to the public, run the AI service in a container with no secrets, a non-root user (the provided Dockerfile does this, though untested), no network access, and read-only files, or replace the runner with an isolated service such as Judge0. Set `SANDBOX_ENABLED=0` to switch code execution off.

On Windows the memory and CPU limits and the per-test timers are not available. Only the overall timeout applies, so an infinite loop fails the whole run after 5 seconds. `GET /sandbox/status` on the AI service reports what is enforced.

Grading is not tamper-proof: learner code runs in the same process as the test harness, so a learner could fake their own result. That only affects their own progress. Do not use it for competitions or certificates without a two-process design.

Not implemented: embedding or vector search, an agent tool-use loop, computer vision.

## Run locally

Requirements: Node 20+, Python 3.10+, PostgreSQL 13+ (local, Docker, or a free Neon database).

```bash
cp .env.example .env            # set DATABASE_URL; optionally choose a language model (see "Language model options")
# Postgres: any of these works
#   docker run -d --name kiln-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kiln postgres:16
#   a local install:  createdb kiln
#   Neon: paste its connection string into DATABASE_URL

# 1. AI service
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000

# 2. API (new terminal)
cd server && npm install && npm run seed && npm run dev

# 3. Client (new terminal)
cd client && npm install && npm run dev      # http://localhost:5173
```

The API creates the tables itself on start (`npm run migrate` does only that). `npm run seed` loads the courses, lessons and 120 simulated learners (`data/generated/learners.json`; regenerate with `python data/generate_synthetic.py`). It **wipes every table** first. Set `AUTO_SEED=1` to load the data automatically, but only when the database is empty.
Demo logins, password `Demo@1234`: `student@kiln.dev`, `teacher@kiln.dev`.

### Docker

```bash
cp .env.example .env            # set JWT_SECRET
docker compose up --build       # starts Postgres, the AI service, the API and the site
# open http://localhost:8080    (the first start creates the tables and loads the demo data)
# to wipe and reload the demo data later:  docker compose run --rm server npm run seed
```

## Tests

```bash
cd ai-service && python -m pytest -q                 # models, endpoints and sandbox security tests
cd server && npm test                                # unit + wiring tests (includes the LLM provider tests)
# Full integration tests (need a seeded Postgres database and the AI service running):
cd server && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kiln_test npm run seed
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kiln_test AI_SERVICE_URL=http://localhost:8000 npm test
cd client && npm run build                           # type-check + production build
python client/scripts/check-contrast.py             # colour contrast in both themes
cd server && npm run eval:rag                        # tutor retrieval check (needs a seeded database)
```

## Notes before you deploy

- Set a strong `JWT_SECRET`; the server refuses to start in production without one (Render generates one for you).
- If you use a paid model, set a spending cap on its key. Tutor questions (20 per 10 minutes) and quiz generation (15 per 10 minutes) are rate limited per user, and the demo accounts are shared, so a busy demo can hit those limits.
- Free hosting tiers sleep when idle, so the first request can be slow.
- Demo mode answers from lesson text only; choose a model (below) for generated answers.

## Deploy on Render with Neon

Total cost: $0 on the free tiers. Free services sleep when idle, so the first request after a pause is slow.

**1. Create the database on Neon** ([neon.com](https://neon.com), free).
1. New project. Choose the region closest to your Render region (Render *Singapore* pairs with Neon *AWS Asia Pacific (Singapore)*; Render *Oregon* with *US West (Oregon)*; Render *Frankfurt* with *Europe (Frankfurt)*).
2. Click **Connect**, turn **Connection pooling** on and copy the connection string. It looks like `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`.
3. If the string ends with `&channel_binding=require` and the app cannot connect, delete that part.

**2. Push this repository to GitHub.** `.env` is git-ignored; never commit it.

**3. Create the services on Render.** *New > Blueprint*, pick the repository. Render reads `render.yaml` and creates two web services:

| Service | What it runs |
|---|---|
| `kiln` | Builds the React app, then starts the Express API, which also serves the site. One URL, no CORS setup, Socket.io on the same address. |
| `kiln-ai` | The Python AI service (Docker). The API reaches it over Render's private network. |

Render asks for one value: paste the Neon string as `DATABASE_URL`. It generates `JWT_SECRET` and the shared `SANDBOX_TOKEN` for you.

**4. Open the `kiln` URL.** On first start the API creates the tables and, because `AUTO_SEED=1`, loads the courses, lessons and 120 simulated learners. Later restarts leave your data alone. Click **Student demo** to check it works.

What to know:

- **Language model.** The default is demo mode. For generated tutor answers add `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` under the `kiln` service's *Environment*. Ollama only works on your own computer, not on Render. Set a spending cap on the key.
- **Neon sleeps too.** A Neon database that scaled to zero takes about a second to wake. The API retries the first connection, so this shows up only as a slow first request.
- **AI service asleep or unreachable.** The API falls back to simple rules and says so in the UI. If private networking is not available for your plan, set `AI_SERVICE_URL` on `kiln` to the public `https://kiln-ai.onrender.com` address instead.
- **Memory.** The free 512 MB instance is enough for the AI service in most cases. If it restarts with an out-of-memory message, move `kiln-ai` to the *Starter* plan.
- **Security.** The AI service gets a public address on Render. The code sandbox needs the shared `SANDBOX_TOKEN` (already set), but for a real public launch change `kiln-ai` to `type: pserv` (a private service, paid) and read the sandbox section above.
- **Reset the demo data.** From the `kiln` service's *Shell* tab (paid plans) run `cd server && npm run seed`, or empty the Neon database and redeploy.

Environment variables the API reads: `DATABASE_URL`, `DATABASE_SSL` (empty = automatic, `0` off, `1` on), `AUTO_SEED`, `JWT_SECRET`, `AI_SERVICE_URL`, `SANDBOX_TOKEN`, `CLIENT_ORIGIN` (only if the site is served from another address), plus the language model settings. See `.env.example`.

## Structure

```
client/      React + TypeScript (Vite). pages/, components/, hooks/, context/, api/
server/      Express + pg + Socket.io. routes/, services/ (llm, rag, agent, aiClient), db/ (schema.sql, pool, queries, seed), sockets/
ai-service/  FastAPI. models/ (dropout, rl_scheduler, recommender, forecast), sandbox/ (code runner), synthetic data generator
data/        Course content (markdown), question banks, coding exercises (+ reference solutions used only by tests), simulated learners
scripts/     ingest_content.js, evaluate_rag.js (entry points; code lives in server/src/scripts/)
docs/        api.md, schema.md, architecture.png, screenshots/
render.yaml  Render Blueprint (Kiln + AI service)
```
