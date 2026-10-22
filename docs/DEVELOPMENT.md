# Development

How to run PulseCoach locally, load the catalogs, and run the tests and evaluations.

- [Requirements](#requirements)
- [Backend](#backend)
- [Catalogs](#catalogs)
- [Web app](#web-app)
- [iOS app](#ios-app)
- [Tests](#tests)
- [Evaluations with the real model](#evaluations-with-the-real-model)
- [Changing the API](#changing-the-api)
- [Continuous integration](#continuous-integration)
- [Conventions](#conventions)

## Requirements

- Python 3.13
- Node.js 22
- [Ollama](https://ollama.com) with three models:

  ```bash
  ollama pull gemma4:e4b        # chat
  ollama pull gemma4:12b        # meal photo analysis
  ollama pull nomic-embed-text  # RAG and catalog search
  ```

  Development was done on a 12 GB laptop GPU. Without Ollama the API, the screens and the unit tests still work.
  Only the chat, photo analysis and integration tests need the models.

## Backend

```bash
python -m venv venv
venv/Scripts/activate              # Windows (Git Bash); Linux/macOS: source venv/bin/activate
pip install -r backend/requirements.txt
```

Create a `.env` file in the **repository root**. Only `JWT_SECRET_KEY` is required: the app refuses to start with
the default value. Every setting and its default is in `backend/app/config.py`.

```dotenv
JWT_SECRET_KEY=<output of: python -c "import secrets; print(secrets.token_urlsafe(64))">

# Optional (defaults shown)
DATABASE_URL=sqlite:///./health_coach.db
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=gemma4:e4b
PHOTO_VISION_MODEL_NAME=gemma4:12b
CORS_ALLOWED_ORIGINS=http://localhost:3000
SCHEDULER_ENABLED=true
# SMTP_* (password reset emails; without it the reset link is written to the log)
# GOOGLE_CLIENT_IDS / APPLE_CLIENT_IDS (social sign-in)
```

Run the API from `backend/`:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

On startup the app runs `alembic upgrade head`, which creates the SQLite database on the first run. Interactive API docs
are at `http://localhost:8000/docs`, and `GET /health/ready` reports the database, the models and the backup age.

After changing a model, create a migration and review it before committing:

```bash
python -m alembic revision --autogenerate -m "short-description"
```

## Catalogs

The food and exercise catalogs are not in git (the USDA source files alone are about 200 MB). The exercise data and
its Turkish translations are in the repository, so they load without any download:

```bash
cd backend
python -m scripts.seed_catalogs --only exercise   # 891 exercises from data_sources/exercises
python -m scripts.seed_tr_foods                   # Turkish dishes researched by hand
```

To rebuild the full USDA food catalog (about 7,800 foods), download SR Legacy, Foundation Foods and FNDDS from
[FoodData Central](https://fdc.nal.usda.gov/download-datasets) into `backend/data_sources/usda/`, then:

```bash
python -m scripts.curate_food_subset                                         # pick the useful subset
python -m scripts.translate_catalog --only foods --model gemma4:12b --no-reasoning  # translate to Turkish (cached)
python -m scripts.seed_catalogs --only food
python -m scripts.food_catalog_fixes                                         # hand-made name corrections
```

`scripts.export_catalog_snapshot` writes the catalogs (and nothing else) into a small SQLite file. That file is what a
new production server loads, so no user data ever leaves the development machine.

## Web app

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

The web app calls `http://localhost:8000` by default. Set `NEXT_PUBLIC_API_BASE_URL` in `web/.env.local` to change it,
and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` to enable Google sign-in. The Next.js version in this project is newer than most
documentation online, so check `node_modules/next/dist/docs/` before relying on an API.

## iOS app

```bash
cd mobile
npm install
npx expo start --dev-client   # Metro on 8081, also serves a web preview
```

- Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to your computer's LAN IP (for example `http://192.168.1.20:8000`).
  If the network changes, the IP changes, and requests then hang without an error.
- The app needs a development build that includes its native modules (Face ID, notifications, Apple sign-in). It does
  not run in Expo Go. Builds are made with EAS (`eas build --profile development`).
- The Expo web preview on port 8081 is useful for quick UI checks and for the App Store screenshot tooling in
  `mobile/store/screenshots/`.
- A new native module must be imported dynamically and needs a new development build. A static import would crash
  every older installed build.

## Tests

```bash
cd backend
python -m pytest -q -m "not integration"   # ~1,230 tests, no Ollama needed
python -m pytest -q -m integration         # 35 tests against the real models
python -m ruff check .
cd .. && pyright                           # must stay at 0 errors
```

The full suite takes several minutes, so run the affected test files first. The same suite runs on PostgreSQL. Each
test engine gets its own schema:

```bash
TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/pulsecoach_test python -m pytest -m "not integration"
```

SQLite does not enforce foreign keys and PostgreSQL does, so tests must reference rows that exist.

Web and iOS:

```bash
cd web && npx tsc --noEmit && npx eslint src && npx playwright test   # e2e needs the backend; chat.spec also needs Ollama
cd mobile && npx tsc --noEmit && npx expo lint
```

## Evaluations with the real model

Run these from `backend/` with `ollama serve` running. They use a temporary copy of the development database and write
results to `backend/eval/results/` (the per-run files are git-ignored).

```bash
python -m eval.chat_regression --trials 5            # after any agent, prompt or tool change
python -m eval.chat_regression --trials 5 --only squat_3x10,bench_4x8
python -m eval.exercise_match_benchmark              # after changing exercise matching
python -m eval.reply_length_eval
python -m eval.latency_benchmark                     # time to first status / text / full reply under load
```

`chat_regression` exits with a non-zero code when any scenario is below 100%. It uses the non-streaming
`run_orchestrator`, so test `/chat/stream` separately (the Playwright chat test covers it). See
[AI.md › Evaluations](AI.md#evaluations) for what each script measures.

## Changing the API

After any change to a router or a Pydantic schema:

```bash
cd backend && python -m scripts.export_openapi openapi.json
cd ../web && npm run gen:api
cd ../mobile && npm run gen:api
```

`api-contract.ts` in each client compares the generated types with the hand-written ones in `lib/api.ts`, so a
mismatch fails `tsc`. CI checks that the committed `openapi.json` is up to date.

## Continuous integration

`.github/workflows/ci.yml` runs on every push:

| Job | Checks |
|---|---|
| Backend (SQLite) | pytest without integration tests |
| Backend (PostgreSQL) | every migration on an empty database, no difference from the models, then pytest |
| Backend lint | ruff and pyright |
| API contract | the schema is regenerated and must match the committed one, and the generated client types must match |
| Web | ESLint and a production build |
| Mobile | TypeScript and ESLint |

`.github/workflows/deploy-smoke.yml` runs the production setup script twice on a fresh Ubuntu 24.04 VM (install, then
update). It checks registration, sign-in and the web pages through Caddy over HTTPS, that services run as a non-root
user and listen only on localhost, a reboot, a backup and restore drill, and the restricted backup key. See
[DEPLOYMENT.md](DEPLOYMENT.md).

## Conventions

- **Layers:** routers stay thin. Business logic lives in `services/`, which the API, the agent tools and the scheduler
  all share.
- **Validation errors:** `raise AppValidationError("code")`, with a Turkish and English message in `app/exceptions.py`.
- **Numbers from users or the model** need an upper bound in `services/limits.py`.
- **Dates:** use `user_time.user_today(db, user_id)`, never the server's date.
- **Turkish text:** use `tr_lower()`. Plain `.lower()` breaks `"İ"`.
- **Agent tools:** accept `None`, keep numbers in bounds, return a clear sentence on failure. Only error-free write
  tools count as "saved".
- **New user data:** migration + validation + data export + legal text if it is a new category or recipient (see
  [PRIVACY.md](PRIVACY.md#checklist-for-new-features)).
- **iOS:** tabs never unmount, so refresh with `useDebouncedFocusEffect`. Icon-only buttons need an
  `accessibilityLabel` and a 44 pt touch target.
- **Language:** the UI and the coach are Turkish first, with English alongside. Code comments are mostly in Turkish.
