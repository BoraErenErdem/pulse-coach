#!/usr/bin/env bash
# Yedek anahtarının zorunlu komutu (deploy/README.md "Yedekleme"). root'un
# authorized_keys'inde şöyle durur:
#   restrict,command="bash /srv/pulsecoach/pulse-coach/deploy/cloudvist/yedek-ver.sh" ssh-ed25519 AAAA... pulsecoach-yedek
# Anahtar yalnız şunları yapabilir (kabuk, scp/sftp, yönlendirme yok):
#   list       -> tamamlanmış dökümlerin "ad bayt" satırları
#   get <ad>   -> o dökümü stdout'a yazar
# Dosyalar uygulama kullanıcısıyla okunur: yedek dizini onun yazabildiği bir
# yer, oraya konmuş bir bağlantı root yetkisiyle izlenmesin.
set -euo pipefail

BACKUPS=/srv/pulsecoach/backups
APP_USER=pulsecoach
NAME_RE='^pulsecoach_[0-9]{8}_[0-9]{6}_[0-9]{6}\.dump$'

read -r cmd arg extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true

case "${cmd:-}" in
  list)
    [ -z "${arg:-}" ] || { echo "list argüman almaz" >&2; exit 2; }
    runuser -u "$APP_USER" -- find "$BACKUPS" -maxdepth 1 -type f -name 'pulsecoach_*.dump' -printf '%f %s\n' \
      | grep -E '^pulsecoach_[0-9]{8}_[0-9]{6}_[0-9]{6}\.dump [0-9]+$' | sort || true
    ;;
  get)
    if [ -n "${extra:-}" ] || ! [[ "${arg:-}" =~ $NAME_RE ]]; then
      echo "geçersiz yedek adı" >&2; exit 2
    fi
    exec runuser -u "$APP_USER" -- cat -- "$BACKUPS/$arg"
    ;;
  *)
    echo "izin verilmeyen komut (yalnız: list, get <ad>)" >&2; exit 2
    ;;
esac
