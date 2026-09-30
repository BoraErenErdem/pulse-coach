#!/usr/bin/env bash
# PulseCoach - RunPod pod kurulumu / açılışı / güncellemesi (2026-09-30).
#
# Tek betik, idempotent: ilk kurulumda, pod her yeniden başladığında ve kod
# güncellemesinden sonra aynı komut çalıştırılır:
#     bash /workspace/pulse-coach/deploy/runpod/setup.sh
#
# Neden böyle: RunPod pod'u zaten bir container - içinde Docker/compose yok.
# Pod durdurulup açılınca container diski (apt paketleri) sıfırlanır, yalnız
# /workspace kalır. Bu yüzden Python, Ollama, cloudflared, rclone ve veriler
# /workspace'te; apt paketleri (Postgres, supervisor) her açılışta yeniden kurulur.
# Community Cloud'da /workspace da makineyle birlikte kaybolabilir - pod dışı
# yedek için bkz. deploy/README.md "Yedekleme".
#
# Ortam değişkenleri (CI/deneme için):
#   PULSECOACH_SKIP_MODELS=1   Ollama modellerini çekme, önbellek ısıtmayı atla
set -euo pipefail

W=/workspace
REPO="$W/pulse-coach"
BACKEND="$REPO/backend"
OPT="$W/opt"
VENV="$W/venv"
ENV_FILE="$REPO/.env"
CONF="$REPO/deploy/runpod/supervisord.conf"
PG_BIN=/usr/lib/postgresql/17/bin
OLLAMA_VERSION=0.30.8
NODE_VERSION=24.13.1
MODELS=(gemma4:e4b gemma4:12b nomic-embed-text)
SKIP_MODELS="${PULSECOACH_SKIP_MODELS:-0}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nHATA: %s\n' "$*" >&2; exit 1; }
wait_for() { # wait_for <açıklama> <saniye> <komut...>
  local what="$1" limit="$2"; shift 2
  for _ in $(seq "$limit"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  die "$what $limit sn içinde hazır olmadı"
}

[ "$(id -u)" = 0 ] || die "root olarak çalıştırın"
[ -d "$BACKEND" ] || die "$REPO yok - önce: git clone https://github.com/BoraErenErdem/pulse-coach $REPO"
mkdir -p "$OPT/bin" "$W/logs" "$W/ollama-models"
# Yedeğin pod dışı kopyası (worker ile aynı rclone ayarı).
export RCLONE_CONFIG="$W/secrets/rclone.conf"
install -d -m 700 "$W/backups" "$W/secrets"

log "Sistem paketleri (Postgres 17, supervisor)"
if [ ! -x "$PG_BIN/postgres" ] || ! command -v supervisord >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg lsb-release git supervisor unzip zstd xz-utils openssl >/dev/null
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  # Paketin kendi "main" kümesini oluşturmasın - veri /workspace/pgdata'da.
  install -d /etc/postgresql-common/createcluster.d
  echo "create_main_cluster = false" > /etc/postgresql-common/createcluster.d/pulsecoach.conf
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends postgresql-17 >/dev/null
fi

log "Kalıcı araçlar ($OPT)"
if [ ! -x "$OPT/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$OPT/bin" UV_NO_MODIFY_PATH=1 sh
fi
if [ "$("$OPT/ollama/bin/ollama" --version 2>/dev/null | grep -o '[0-9][0-9.]*' | tail -n1)" != "$OLLAMA_VERSION" ]; then
  rm -rf "$OPT/ollama" && mkdir -p "$OPT/ollama"
  curl -fsSL "https://ollama.com/download/ollama-linux-amd64.tar.zst?version=$OLLAMA_VERSION" | zstd -d | tar -xf - -C "$OPT/ollama"
  OLLAMA_UPDATED=1
fi
if [ ! -x "$OPT/bin/cloudflared" ]; then
  curl -fsSL -o "$OPT/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$OPT/bin/cloudflared"
fi
if [ "$("$OPT/node/bin/node" --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  rm -rf "$OPT/node" && mkdir -p "$OPT/node"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" | tar -xJf - -C "$OPT/node" --strip-components=1
fi
if [ ! -x "$OPT/bin/rclone" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/rclone.zip" https://downloads.rclone.org/rclone-current-linux-amd64.zip
  unzip -q "$tmp/rclone.zip" -d "$tmp" && mv "$tmp"/rclone-*/rclone "$OPT/bin/rclone" && rm -rf "$tmp"
fi

log "Python ortamı ($VENV)"
export UV_PYTHON_INSTALL_DIR="$OPT/python"
[ -x "$VENV/bin/python" ] || "$OPT/bin/uv" venv --python 3.13 "$VENV"
req_hash="$(sha256sum "$BACKEND/requirements.txt" | cut -d' ' -f1)"
if [ "$(cat "$VENV/.requirements.sha256" 2>/dev/null)" != "$req_hash" ]; then
  "$OPT/bin/uv" pip install --python "$VENV/bin/python" -r "$BACKEND/requirements.txt"
  echo "$req_hash" > "$VENV/.requirements.sha256"
fi

log "Gizli ayarlar ($ENV_FILE)"
[ -f "$ENV_FILE" ] || cp "$REPO/deploy/env.production.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ensure_key() { # değer yoksa ya da boşsa üretileni yazar, varsa dokunmaz
  local key="$1" value="$2"
  if ! grep -qE "^$key=.+" "$ENV_FILE"; then
    sed -i "/^$key=\$/d" "$ENV_FILE"
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    echo "  $key üretildi"
  fi
}
ensure_key JWT_SECRET_KEY "$(openssl rand -hex 48)"
ensure_key DATABASE_URL "postgresql+psycopg://pulsecoach:$(openssl rand -hex 24)@127.0.0.1:5432/pulsecoach"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
DB_PASSWORD="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#')"

log "Postgres veri dizini"
if [ ! -s "$W/pgdata/PG_VERSION" ]; then
  install -d -o postgres -g postgres -m 700 "$W/pgdata"
  pwfile="$(mktemp)" && printf '%s\n' "$DB_PASSWORD" > "$pwfile" && chown postgres "$pwfile"
  su postgres -s /bin/sh -c "$PG_BIN/initdb -D $W/pgdata -U pulsecoach --pwfile=$pwfile -E UTF8 --locale=C.UTF-8 -A scram-sha-256" >/dev/null
  rm -f "$pwfile"
  echo "  küme oluşturuldu"
fi
# apt her açılışta postgres kullanıcısını yeniden oluşturur; uid değişmiş olabilir.
chown -R postgres:postgres "$W/pgdata" && chmod 700 "$W/pgdata"

log "Süreç yöneticisi"
if supervisorctl -c "$CONF" pid >/dev/null 2>&1; then
  supervisorctl -c "$CONF" update
else
  supervisord -c "$CONF"
fi
supervisorctl -c "$CONF" start postgres ollama >/dev/null || true
[ "${OLLAMA_UPDATED:-0}" = 1 ] && supervisorctl -c "$CONF" restart ollama
wait_for "Postgres" 60 "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432
export PGPASSWORD="$DB_PASSWORD"
if ! "$PG_BIN/psql" -h 127.0.0.1 -U pulsecoach -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='pulsecoach'" | grep -q 1; then
  "$PG_BIN/createdb" -h 127.0.0.1 -U pulsecoach pulsecoach
  echo "  pulsecoach veritabanı oluşturuldu"
fi
wait_for "Ollama" 60 curl -fsS http://127.0.0.1:11434/api/tags

if [ "$SKIP_MODELS" != "1" ]; then
  log "Ollama modelleri"
  for model in "${MODELS[@]}"; do
    OLLAMA_HOST=127.0.0.1:11434 "$OPT/ollama/bin/ollama" pull "$model"
  done
fi

cd "$BACKEND"
if "$PG_BIN/psql" -h 127.0.0.1 -U pulsecoach -d pulsecoach -tAc "SELECT to_regclass('alembic_version')" | grep -q alembic_version; then
  log "Güncelleme öncesi yedek"
  "$VENV/bin/python" -c "from app.services.backup_service import backup_database; print(backup_database())"
fi
unset PGPASSWORD

log "Release (migration + katalog + önbellek)"
release_args=(--catalog-snapshot "$W/catalog_snapshot.db")
[ "$SKIP_MODELS" = "1" ] && release_args+=(--skip-warmup)
"$VENV/bin/python" -m scripts.release "${release_args[@]}"

log "İlk/güncel yedek"
"$VENV/bin/python" -c "from app.services.backup_service import backup_database; print(backup_database())"

log "Web arayüzü (Next.js)"
# NEXT_PUBLIC_* build anında gömülür: adres değişirse yeniden build gerekir.
web_api="$(grep -E '^NEXT_PUBLIC_API_BASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$web_api" ] || die "NEXT_PUBLIC_API_BASE_URL .env'de yok (ör. https://api.pulsecoachapp.com)"
web_stamp="$(git -C "$REPO" rev-parse HEAD:web)|$(grep -E '^NEXT_PUBLIC_' "$ENV_FILE" | sort | sha256sum | cut -d' ' -f1)"
if [ "$(cat "$W/.web-build-stamp" 2>/dev/null)" != "$web_stamp" ]; then
  (
    cd "$REPO/web"
    export PATH="$OPT/node/bin:$PATH" NEXT_TELEMETRY_DISABLED=1
    set -a; eval "$(grep -E '^NEXT_PUBLIC_[A-Z_]+=' "$ENV_FILE")"; set +a
    npm ci --no-audit --no-fund
    npm run build
  )
  echo "$web_stamp" > "$W/.web-build-stamp"
fi

log "Backend + worker + web + tünel"
supervisorctl -c "$CONF" restart web worker webapp
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ENV_FILE"; then
  supervisorctl -c "$CONF" restart tunnel
else
  echo "  CLOUDFLARE_TUNNEL_TOKEN yok - tünel başlatılmadı (deploy/README.md)"
fi
wait_for "Backend" 60 curl -fsS http://127.0.0.1:8000/health
wait_for "Web arayüzü" 60 curl -fsS -o /dev/null http://127.0.0.1:3000/kvkk

log "Durum"
supervisorctl -c "$CONF" status || true
curl -sS http://127.0.0.1:8000/health/ready; echo
command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader
echo "Tamam. Loglar: $W/logs"
