#!/usr/bin/env bash
# PulseCoach - Cloudvist GPU VM kurulumu / güncellemesi (2026-10-12).
#
# Tek betik, idempotent: ilk kurulumda ve her kod güncellemesinden sonra aynı komut:
#     bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/setup.sh
#
# RunPod betiğinden (git geçmişinde deploy/runpod) farkı: burası gerçek bir VM -
# disk kalıcı, systemd ve sabit IP var. Bu yüzden süreçler systemd birimi (sunucu
# yeniden başlayınca kendiliğinden kalkar), Postgres paketin kendi kümesi, HTTPS
# Caddy + Let's Encrypt (Cloudflare yalnız DNS - trafik yurt dışından geçmez),
# NVIDIA sürücüsünü biz kurarız ve uygulama root değil "pulsecoach" kullanıcısıyla
# çalışır: kod ve .env root'un, süreçler yalnız $DATA ve $ROOT/backups'a yazar.
#
# Ortam değişkenleri (CI/deneme için):
#   PULSECOACH_SKIP_MODELS=1   Ollama modellerini çekme, önbellek ısıtmayı atla
#   PULSECOACH_SKIP_GPU=1      NVIDIA sürücü adımını atla (GPU'suz makine)
#   PULSECOACH_TLS=internal    Let's Encrypt yerine Caddy'nin kendi imzaladığı sertifika
set -euo pipefail
umask 022

ROOT=/srv/pulsecoach
REPO="$ROOT/pulse-coach"
BACKEND="$REPO/backend"
OPT="$ROOT/opt"
VENV="$ROOT/venv"
DATA="$ROOT/data"
ENV_FILE="$REPO/.env"
DEPLOY="$REPO/deploy/cloudvist"
APP_USER=pulsecoach
PG_VERSION=17
PG_BIN="/usr/lib/postgresql/$PG_VERSION/bin"
OLLAMA_VERSION=0.30.8
NODE_VERSION=24.13.1
MODELS=(gemma4:e4b gemma4:12b nomic-embed-text)
SERVICES=(pulsecoach-api pulsecoach-worker pulsecoach-webapp)
SKIP_MODELS="${PULSECOACH_SKIP_MODELS:-0}"
SKIP_GPU="${PULSECOACH_SKIP_GPU:-0}"
TLS_MODE="${PULSECOACH_TLS:-acme}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nHATA: %s\n' "$*" >&2; exit 1; }
wait_for() { # wait_for <açıklama> <saniye> <komut...>
  local what="$1" limit="$2"; shift 2
  for _ in $(seq "$limit"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  die "$what $limit sn içinde hazır olmadı"
}
apt_install() {
  apt-get install -y -qq -o DPkg::Lock::Timeout=300 --no-install-recommends "$@" >/dev/null
}
put_file() { # put_file <hedef> <kip> (içerik stdin'den); dosya değiştiyse 0 döner
  local target="$1" mode="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if cmp -s "$tmp" "$target"; then rm -f "$tmp"; return 1; fi
  install -m "$mode" "$tmp" "$target"
  rm -f "$tmp"
}
env_value() { { grep -E "^$1=" "$ENV_FILE" || true; } | head -n1 | cut -d= -f2- | tr -d '\r'; }
# Uygulama kullanıcısıyla çalıştırır (release, yedek, model çekme).
as_app() {
  runuser -u "$APP_USER" -- env HOME="$DATA/home" RCLONE_CONFIG="$ROOT/secrets/rclone.conf" "$@"
}
pg_sql() { (cd / && runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtA "$@"); }
has_nvidia_card() { grep -qi '^0x10de$' /sys/bus/pci/devices/*/vendor 2>/dev/null; }

[ "$(id -u)" = 0 ] || die "root olarak çalıştırın"
[ -d "$BACKEND" ] || die "$REPO yok - önce: git clone https://github.com/BoraErenErdem/pulse-coach $REPO"
command -v systemctl >/dev/null || die "systemd yok - bu betik bir VM içindir"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1

log "Sistem paketleri (Postgres $PG_VERSION, Caddy, ufw)"
if [ ! -x "$PG_BIN/postgres" ] || ! command -v caddy >/dev/null || ! command -v ufw >/dev/null; then
  apt-get update -qq
  apt_install ca-certificates curl gnupg lsb-release git unzip zstd xz-utils openssl ufw
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL -o /etc/apt/sources.list.d/caddy-stable.list https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt_install "postgresql-$PG_VERSION" caddy
fi

log "NVIDIA sürücüsü"
if [ "$SKIP_GPU" = 1 ]; then
  echo "  atlandı (PULSECOACH_SKIP_GPU=1)"
else
  has_nvidia_card || die "Sunucuda NVIDIA kart görünmüyor (PCI üretici 10de yok) - Cloudvist'e bildir."
  if ! nvidia-smi >/dev/null 2>&1; then
    # Ollama kendi CUDA kitaplıklarıyla gelir: yalnız çekirdek modülü + nvidia-smi gerekir.
    apt-get update -qq
    apt_install ubuntu-drivers-common
    ubuntu-drivers install --gpgpu
    branch="$( { dpkg-query -W -f='${Package}\n' 'nvidia-headless-*' 2>/dev/null || true; } \
      | sed -nE 's/^nvidia-headless-(no-dkms-)?([0-9]+(-server)?)(-open)?$/\2/p' | sort -V | tail -n1)"
    [ -n "$branch" ] || die "ubuntu-drivers bir NVIDIA sürücüsü kurmadı - deploy/README.md 'NVIDIA sürücüsü' bölümüne bak."
    apt_install "nvidia-utils-$branch"
    modprobe nvidia >/dev/null 2>&1 || true
    modprobe nvidia_uvm >/dev/null 2>&1 || true
    nvidia-smi >/dev/null 2>&1 \
      || die "Sürücü kuruldu (nvidia-$branch) ama henüz yüklenemedi: sunucuyu yeniden başlat (reboot), sonra bu betiği tekrar çalıştır."
  fi
  # Sunucu yeniden başlayınca modüller Ollama'dan önce yüklü olsun.
  if put_file /etc/modules-load.d/pulsecoach-nvidia.conf 644 <<'EOF'
nvidia
nvidia_uvm
EOF
  then echo "  modüller açılışta yüklenecek"; fi
  gpu="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | head -n1)"
  echo "  kart: $gpu MiB"
  case "$gpu" in *A5000*) ;; *) echo "  UYARI: beklenen kart RTX A5000 - Cloudvist'e bildir." ;; esac
  if [ "${gpu##*, }" -lt 20000 ] 2>/dev/null; then
    echo "  UYARI: 20 GB'tan az VRAM - üç model birlikte sığmaz (deploy/README.md 'Ollama ayarı')."
  fi
fi

log "Sistem ayarları (log saklama, otomatik güncelleme, güvenlik duvarı)"
# KVKK metni: erişim kayıtları 14 gün. Journal günlük dosyalara bölünür, 14 günden
# eskisi silinir (Caddy'nin erişim kaydı Caddyfile'da ayrıca 14 güne ayarlı).
install -d /etc/systemd/journald.conf.d
if put_file /etc/systemd/journald.conf.d/pulsecoach.conf 644 <<'EOF'
[Journal]
MaxRetentionSec=14day
MaxFileSec=1day
SystemMaxUse=2G
EOF
then systemctl restart systemd-journald; fi
# Çekirdek ve NVIDIA paketleri kendiliğinden güncellenmesin: kitaplık yüklü modülden
# yeni olursa GPU yeniden başlatmaya kadar kaybolur ve modeller sessizce CPU'ya düşer.
# Bunlar elle güncellenir (deploy/README.md "Sistem güncellemesi").
if put_file /etc/apt/apt.conf.d/52pulsecoach-hold-gpu 644 <<'EOF'
Unattended-Upgrade::Package-Blacklist {
    "linux-";
    "nvidia-";
    "libnvidia-";
};
EOF
then echo "  çekirdek/NVIDIA otomatik güncellemesi kapatıldı"; fi
# SSH hangi porttaysa o açık kalır (kilitlenmemek için), gerisi yalnız 80/443.
ssh_ports="$( { sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }'; echo "${SSH_CONNECTION:-}" | awk '{ print $4 }'; } | { grep -E '^[0-9]+$' || true; } | sort -u)"
for port in ${ssh_ports:-22}; do ufw allow "$port/tcp" >/dev/null; done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw logging off >/dev/null
ufw --force enable >/dev/null
echo "  ufw açık: SSH (${ssh_ports:-22}), 80, 443"

log "Uygulama kullanıcısı ve dizinler"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$DATA/home" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
for group in video render; do
  if getent group "$group" >/dev/null; then usermod -aG "$group" "$APP_USER"; fi
done
mkdir -p "$OPT/bin"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$ROOT/backups"
# Alt dizinleri uygulama kullanıcısı kendisi açar: root, onun yazabildiği bir dizinin
# içinde chown/chmod yapmaz (oraya konmuş bir bağlantı root yetkisiyle izlenirdi).
as_app mkdir -p "$DATA/home" "$DATA/ollama-models" "$DATA/faiss_index" "$DATA/catalog_vectors"
install -d -o root -g "$APP_USER" -m 750 "$ROOT/secrets"
if [ -f "$ROOT/secrets/rclone.conf" ]; then
  chown root:"$APP_USER" "$ROOT/secrets/rclone.conf" && chmod 640 "$ROOT/secrets/rclone.conf"
fi
(cd "$BACKEND" && as_app test -r requirements.txt) \
  || die "$APP_USER kullanıcısı $REPO'yu okuyamıyor: chmod -R a+rX $REPO (sonra bu betik .env'i yeniden 640 yapar)"

log "Araçlar ($OPT)"
if [ ! -x "$OPT/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$OPT/bin" UV_NO_MODIFY_PATH=1 sh
fi
if [ "$("$OPT/ollama/bin/ollama" --version 2>/dev/null | grep -o '[0-9][0-9.]*' | tail -n1)" != "$OLLAMA_VERSION" ]; then
  rm -rf "$OPT/ollama" && mkdir -p "$OPT/ollama"
  curl -fsSL "https://ollama.com/download/ollama-linux-amd64.tar.zst?version=$OLLAMA_VERSION" | zstd -d | tar -xf - -C "$OPT/ollama"
  OLLAMA_UPDATED=1
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
[ -x "$VENV/bin/python" ] || "$OPT/bin/uv" venv --python 3.13 --python-preference only-managed "$VENV"
req_hash="$(sha256sum "$BACKEND/requirements.txt" | cut -d' ' -f1)"
if [ "$(cat "$VENV/.requirements.sha256" 2>/dev/null)" != "$req_hash" ]; then
  # Süreçler ortama yazamaz: bayt kodu şimdi derlenmezse her açılışta yeniden derlenirdi.
  "$OPT/bin/uv" pip install --compile-bytecode --python "$VENV/bin/python" -r "$BACKEND/requirements.txt"
  echo "$req_hash" > "$VENV/.requirements.sha256"
fi
"$VENV/bin/python" -m compileall -q "$BACKEND/app" "$BACKEND/scripts"

log "Gizli ayarlar ($ENV_FILE)"
[ -f "$ENV_FILE" ] || cp "$REPO/deploy/env.production.example" "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE" && chmod 640 "$ENV_FILE"
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
DB_PASSWORD="$(env_value DATABASE_URL | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#')"
[[ "$DB_PASSWORD" =~ ^[A-Za-z0-9_-]+$ ]] || die "DATABASE_URL parolası yalnız harf, rakam, _ ve - içermeli"
WEB_HOST="$(env_value FRONTEND_BASE_URL | sed -E 's#^[a-z]+://##; s#[/:].*$##')"
API_HOST="$(env_value NEXT_PUBLIC_API_BASE_URL | sed -E 's#^[a-z]+://##; s#[/:].*$##')"
[ -n "$WEB_HOST" ] || die "FRONTEND_BASE_URL .env'de yok (ör. https://pulsecoachapp.com)"
[ -n "$API_HOST" ] || die "NEXT_PUBLIC_API_BASE_URL .env'de yok (ör. https://api.pulsecoachapp.com)"

log "Postgres"
if [ ! -d "/etc/postgresql/$PG_VERSION/main" ]; then
  pg_createcluster "$PG_VERSION" main >/dev/null
fi
if [ "$(pg_conftool -s "$PG_VERSION" main show port)" != 5432 ]; then
  pg_conftool "$PG_VERSION" main set port 5432
  systemctl restart "postgresql@$PG_VERSION-main"
fi
systemctl enable -q postgresql
systemctl start "postgresql@$PG_VERSION-main"
wait_for "Postgres" 60 "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432
if ! pg_sql -c "SELECT 1 FROM pg_roles WHERE rolname = 'pulsecoach'" | grep -q 1; then
  pg_sql -c "CREATE ROLE pulsecoach LOGIN"
fi
# Parola her çalıştırmada .env ile eşitlenir (komut satırında görünmesin diye stdin'den).
printf "ALTER ROLE pulsecoach PASSWORD '%s';\n" "$DB_PASSWORD" | pg_sql
if ! pg_sql -c "SELECT 1 FROM pg_database WHERE datname = 'pulsecoach'" | grep -q 1; then
  (cd / && runuser -u postgres -- createdb -T template0 -E UTF8 --locale=C.UTF-8 -O pulsecoach pulsecoach)
  echo "  pulsecoach veritabanı oluşturuldu"
fi

log "systemd birimleri"
units_changed=0
for unit in "$DEPLOY"/systemd/*.service; do
  if ! cmp -s "$unit" "/etc/systemd/system/$(basename "$unit")"; then
    install -m 644 "$unit" /etc/systemd/system/
    units_changed=1
  fi
done
if [ "$units_changed" = 1 ]; then systemctl daemon-reload; fi
systemctl enable -q pulsecoach-ollama
if [ "${OLLAMA_UPDATED:-0}" = 1 ] || [ "$units_changed" = 1 ]; then
  systemctl restart pulsecoach-ollama
else
  systemctl start pulsecoach-ollama
fi
wait_for "Ollama" 60 curl -fsS http://127.0.0.1:11434/api/tags

if [ "$SKIP_MODELS" != "1" ]; then
  log "Ollama modelleri"
  for model in "${MODELS[@]}"; do
    as_app env OLLAMA_HOST=127.0.0.1:11434 "$OPT/ollama/bin/ollama" pull "$model"
  done
fi

cd "$BACKEND"
if pg_sql -d pulsecoach -c "SELECT to_regclass('public.alembic_version')" | grep -q alembic_version; then
  log "Güncelleme öncesi yedek"
  as_app "$VENV/bin/python" -c "from app.services.backup_service import backup_database; print(backup_database())"
fi

log "Release (migration + katalog + önbellek)"
# Katalog dosyası kişisel veri içermez; scp ile 600 gelmiş olabilir.
if [ -f "$ROOT/catalog_snapshot.db" ]; then chmod 644 "$ROOT/catalog_snapshot.db"; fi
release_args=(--catalog-snapshot "$ROOT/catalog_snapshot.db")
if [ "$SKIP_MODELS" = "1" ]; then release_args+=(--skip-warmup); fi
as_app "$VENV/bin/python" -m scripts.release "${release_args[@]}"

log "İlk/güncel yedek"
as_app "$VENV/bin/python" -c "from app.services.backup_service import backup_database; print(backup_database())"

log "Web arayüzü (Next.js)"
# NEXT_PUBLIC_* build anında gömülür: adres değişirse yeniden build gerekir.
web_stamp="$(git -C "$REPO" rev-parse HEAD:web)|$(grep -E '^NEXT_PUBLIC_' "$ENV_FILE" | sort | sha256sum | cut -d' ' -f1)"
web_cache="$REPO/web/.next/cache"
if [ "$(cat "$ROOT/.web-build-stamp" 2>/dev/null)" != "$web_stamp" ]; then
  # Derleme root'la çalışır; önbelleğe ise süreç kullanıcısı yazabilir. Root onun
  # yazdığını okumasın, oradaki bir bağlantının üzerine yazmasın: derlemeden önce silinir.
  rm -rf "$web_cache"
  (
    cd "$REPO/web"
    export PATH="$OPT/node/bin:$PATH" NEXT_TELEMETRY_DISABLED=1
    set -a; eval "$(grep -E '^NEXT_PUBLIC_[A-Z_]+=' "$ENV_FILE")"; set +a
    npm ci --no-audit --no-fund
    npm run build
  )
  echo "$web_stamp" > "$ROOT/.web-build-stamp"
  rm -rf "$web_cache"
fi
# next start çalışırken yalnız önbelleğe yazar (görsel iyileştirme vb.). Boş dizin
# olarak açılır; var olan dizinde root özyinelemeli chown yapmaz.
if [ ! -e "$web_cache" ]; then install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$web_cache"; fi

log "Backend + worker + web"
systemctl enable -q "${SERVICES[@]}"
systemctl restart "${SERVICES[@]}"
wait_for "Backend" 90 curl -fsS http://127.0.0.1:8000/health
wait_for "Web arayüzü" 90 curl -fsS -o /dev/null http://127.0.0.1:3000/kvkk

log "Caddy (HTTPS: $WEB_HOST, www.$WEB_HOST, $API_HOST)"
install -d -o caddy -g caddy -m 750 /var/log/caddy
tls_line=""
if [ "$TLS_MODE" = internal ]; then tls_line="tls internal"; fi
acme_email="$(env_value SMTP_FROM_EMAIL)"
caddyfile="$(mktemp)"
sed -e "s|__WEB_HOST__|$WEB_HOST|g" -e "s|__API_HOST__|$API_HOST|g" -e "s|__TLS__|$tls_line|g" \
  -e "s|__ACME_EMAIL__|${acme_email:+email $acme_email}|g" "$DEPLOY/Caddyfile" > "$caddyfile"
chmod 644 "$caddyfile"
if ! cmp -s "$caddyfile" /etc/caddy/Caddyfile; then
  # caddy kullanıcısıyla doğrula: root doğrularsa erişim logu root'un olur, Caddy yazamaz.
  if ! check="$(runuser -u caddy -- env HOME=/var/lib/caddy caddy validate --config "$caddyfile" --adapter caddyfile 2>&1)"; then
    printf '%s\n' "$check" >&2
    die "Caddyfile geçersiz ($DEPLOY/Caddyfile)"
  fi
  install -m 644 "$caddyfile" /etc/caddy/Caddyfile
  systemctl enable -q caddy
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
fi
rm -f "$caddyfile"
systemctl enable -q --now caddy

log "Durum"
for unit in "postgresql@$PG_VERSION-main" pulsecoach-ollama "${SERVICES[@]}" caddy; do
  printf '  %-26s %s\n' "$unit" "$(systemctl is-active "$unit" || true)"
done
curl -sS http://127.0.0.1:8000/health/ready; echo
if [ "$SKIP_GPU" != 1 ]; then
  nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader
  # Yüklü modellerin tamamı GPU'da mı? (Isıtma en az gömme modelini yükler.)
  ps_json="$(mktemp)"
  if curl -fsS -o "$ps_json" http://127.0.0.1:11434/api/ps; then
    "$VENV/bin/python" - "$ps_json" <<'PY' || true
import json, sys
models = json.load(open(sys.argv[1])).get("models", [])
for m in models:
    size, vram = m.get("size") or 1, m.get("size_vram") or 0
    print(f"  {m['name']}: %{100 * vram // size} GPU")
    if vram < size:
        print("  UYARI: model tamamen GPU'da değil - sürücüyü ve VRAM'i kontrol et (deploy/README.md).")
PY
  fi
  rm -f "$ps_json"
fi
# Dışarıdan görünen adres: DNS A kaydı bu sunucuyu göstermeden Let's Encrypt sertifika vermez.
public_ok=0
for _ in $(seq 9); do
  if curl -fsS -o /dev/null --max-time 5 "https://$API_HOST/health" 2>/dev/null; then public_ok=1; break; fi
  sleep 5
done
if [ "$public_ok" = 1 ]; then
  echo "  https://$API_HOST/health: OK"
else
  echo "  https://$API_HOST/health henüz yanıt vermiyor - DNS A kayıtlarını (@, www, api) kontrol et;"
  echo "  sertifika durumu: journalctl -u caddy -n 50 --no-pager"
fi
echo "Tamam. Loglar: journalctl -u pulsecoach-api -f   (birimler: pulsecoach-ollama, ${SERVICES[*]}, caddy)"
