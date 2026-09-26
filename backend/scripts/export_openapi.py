"""Backend OpenAPI şemasını dosyaya yazar (2026-09-26) - web/mobil `api-schema.ts`
bundan üretilir (`npm run gen:api`), CI şemanın güncel olduğunu denetler.

Kullanım (backend/ dizininden): python -m scripts.export_openapi ../web/openapi.json
Sunucu açmaz, veritabanına dokunmaz (açılış migration'ı kapalı).
"""

import json
import os
import sys

os.environ.setdefault("RUN_MIGRATIONS_ON_STARTUP", "false")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
# Şema üretimi gizli anahtara ihtiyaç duymaz; uygulama varsayılan anahtarla açılmayı reddediyor.
os.environ.setdefault("JWT_SECRET_KEY", "openapi-export-only-not-a-real-secret")

from app.main import app  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    schema = app.openapi()
    with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
        json.dump(schema, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"{len(schema['paths'])} yol, {len(schema['components']['schemas'])} şema -> {sys.argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
