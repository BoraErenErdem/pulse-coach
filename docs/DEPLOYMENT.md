# Deployment

PulseCoach runs on a single GPU virtual machine in Turkey (NVIDIA RTX 4090 D, 24 GB, Ubuntu 24.04). One idempotent
script installs and updates everything. The step-by-step runbook, in Turkish, is [`deploy/README.md`](../deploy/README.md).
This page is the overview.

## Topology

```
internet ──► Caddy :443 (TLS from Let's Encrypt, security headers)
               ├─ pulsecoach-webapp        next start, 127.0.0.1:3000      → pulsecoachapp.com
               ├─ pulsecoach-api           uvicorn, 2 workers, 127.0.0.1:8000 → api.pulsecoachapp.com
               ├─ pulsecoach-worker        python -m app.worker (scheduler, backups)
               ├─ postgresql 17            127.0.0.1:5432
               ├─ pulsecoach-ollama        127.0.0.1:11434
               └─ pulsecoach-warm-models   loads the models after every Ollama start
```

- Every process is a **systemd unit** (`deploy/cloudvist/systemd/`) and comes back by itself after a reboot.
- Services run as the `pulsecoach` user. The code and `.env` belong to root, and the services can write only to the
  data and backup directories.
- Only ports 80 and 443 are open. SSH accepts keys only. Cloudflare is DNS only, so traffic goes straight to the server.
- The API processes start with `SCHEDULER_ENABLED=false` and `RUN_MIGRATIONS_ON_STARTUP=false`. The worker is the only
  process that runs scheduled jobs, and a PostgreSQL advisory lock enforces this.

## Install and update

`deploy/cloudvist/setup.sh` does everything, and running it again is how the server is updated:

1. System packages: PostgreSQL 17, Caddy, the firewall (only SSH, 80 and 443 open), automatic security updates and
   the NVIDIA driver.
2. The `pulsecoach` user, directories and permissions, then pinned versions of Ollama, Node.js, Python (through
   `uv`) and rclone.
3. `.env` from `deploy/env.production.example`. Empty secrets (JWT key, database password) are generated. Values
   already filled in are never overwritten.
4. The PostgreSQL database and the systemd units, then the model pulls (skippable when the models are already there).
5. On an update, a backup of the database **before** anything changes.
6. `python -m scripts.release`, which:
   - runs `alembic upgrade head`,
   - loads the catalogs from a snapshot file on the first install,
   - applies the catalog changes from git (new Turkish foods, name fixes, exercise renames, including on past sets),
   - builds the RAG and catalog embedding indexes, so the first users do not wait and several workers do not build
     them at once.
7. A fresh backup, the web build, a restart of the API, worker and web services, and the Caddy configuration built
   from the domain names in `.env`.
8. Loading the models into GPU memory and a final `/health/ready` check.

A release is: push to GitHub, then on the server `git pull --ff-only` and run `setup.sh` again. A change to a
`NEXT_PUBLIC_*` value rebuilds the web app.

The same script is tested in CI (`deploy-smoke.yml`) on a fresh Ubuntu 24.04 VM without a GPU. It runs twice (install,
then update), then checks HTTPS sign-up and sign-in through Caddy, that services are not root and listen only on
localhost, a full reboot, a backup and restore, and the restricted backup key. Only the NVIDIA driver step cannot be
tested there.

## Model serving

Ollama settings (`pulsecoach-ollama.service`):

| Setting | Value | Why |
|---|---|---|
| `OLLAMA_NUM_PARALLEL` | 4 | Four chat turns are generated at the same time instead of queueing |
| `OLLAMA_FLASH_ATTENTION` | 1 | Required for the quantized KV cache, and faster |
| `OLLAMA_KV_CACHE_TYPE` | `q8_0` | A 32k context with q8 uses less memory than 20k with f16 |
| `OLLAMA_MAX_LOADED_MODELS` | 3 | Chat, vision and embedding models stay loaded together |
| `OLLAMA_KEEP_ALIVE` | `-1m` | Never unload (no cold start of about 20 s). Plain `-1` is rejected |
| `LLM_NUM_CTX` (app) | 32768 | Measured prompts: median 11.9k tokens, largest 16.1k, plus up to 3k of output |

Ollama model tags can be republished upstream. A new tag can need a newer Ollama, and pulling it replaces the old
weights. Before pulling an updated tag, the current one is copied under a new name, so it is possible to roll back.

## Backups and recovery

- The worker runs `pg_dump --format=custom` every night. The last 14 dumps stay on the server.
- Each dump is copied off the server through an encrypted rclone `crypt` remote to storage in Turkey, and kept 30 days.
- A separate SSH key can only list and download backups (a forced command, no shell), so backups can also be pulled to
  an encrypted local machine.
- Restore: `pg_restore --clean --if-exists --no-owner -d <database-url> <file>.dump`. This is rehearsed in CI.

## Monitoring

- `GET /health` (liveness) and `GET /health/ready` (database reachable, all three models present in Ollama, last backup
  newer than 36 hours). Both also answer `HEAD`, which the uptime monitor uses.
- An external uptime monitor checks `/health/ready` and alerts by email.
- Every model call logs prompt and output token counts, and warns when a prompt passes 80% of the context window.

## Production checklist

- `JWT_SECRET_KEY` is set (the app refuses to start without it).
- `CORS_ALLOWED_ORIGINS`, `FRONTEND_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` match the domains.
- SMTP is configured (otherwise password reset links only go to the log).
- `GOOGLE_CLIENT_IDS` contains **both** the iOS and the web client ID. `APPLE_CLIENT_IDS` contains the iOS bundle ID.
- The off-site backup remote is configured, and `/health/ready` reports a recent backup.
