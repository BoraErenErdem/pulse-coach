"""Katalog adları için anlamsal (gömme) yakın-komşu araması (2026-09-29).

Neden: kelime tabanlı eşleştirme (fuzzy_match) aynı hareketi farklı kelimelerle
anlatan ifadelerde aday bile bulamıyordu - "stair climber" (katalogda
"Stairmaster"), "halatla triceps" ("Triceps Pushdown - Rope Attachment"),
"dambıl rdl" ("Romanian Deadlift"). Bu modül yalnızca ADAY üretir; seçim
exercise_resolver'da yapılır.

Vektörler (RAG ile aynı `nomic-embed-text`) ilk kullanımda hesaplanır (~900
satır, ~15 sn) ve katalog içeriğinin özetiyle adlandırılmış bir dosyaya yazılır;
katalog değişince (seed/yeniden adlandırma betikleri) özet değişir, yeniden
hesaplanır. Ollama erişilemezse arama boş döner ve bir süre yeniden denenmez -
eşleştirme kelime tabanlı adaylarla devam eder.
"""

import hashlib
import logging
import os
import threading
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

EmbedFn = Callable[[list[str]], list[list[float]]]

_BATCH = 32  # Ollama tek istekte ~900 metni gömerken hata verdi (2026-09-29)
_RETRY_AFTER_S = 300.0


def _default_embed(texts: list[str]) -> list[list[float]]:
    from app.rag.embedder import get_embeddings

    return get_embeddings().embed_documents(texts)


class CatalogVectors:
    def __init__(self, kind: str, cache_dir: str | Path, embed: EmbedFn | None = None) -> None:
        self._kind = kind
        self._cache_dir = Path(cache_dir)
        self._embed = embed or _default_embed
        self._lock = threading.Lock()
        self._ids: list[int] = []
        self._matrix: np.ndarray | None = None
        self._digest: str | None = None
        self._failed_at: float | None = None

    @staticmethod
    def _text(row: Any) -> str:
        return f"{row.name_en} | {row.name_tr}"

    def _digest_for(self, rows: Sequence[Any]) -> str:
        h = hashlib.sha256()
        for row in sorted(rows, key=lambda r: r.id):
            h.update(f"{row.id}\t{self._text(row)}\n".encode())
        return h.hexdigest()[:16]

    def _embed_all(self, texts: list[str], prefix: str) -> np.ndarray:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), _BATCH):
            vectors.extend(self._embed([prefix + t for t in texts[start : start + _BATCH]]))
        matrix = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        return matrix / np.where(norms == 0, 1, norms)

    def _ensure(self, rows: Sequence[Any]) -> bool:
        digest = self._digest_for(rows)
        if self._matrix is not None and self._digest == digest:
            return True
        if self._failed_at is not None and time.monotonic() - self._failed_at < _RETRY_AFTER_S:
            return False
        with self._lock:
            if self._matrix is not None and self._digest == digest:
                return True
            ordered = sorted(rows, key=lambda r: r.id)
            path = self._cache_dir / f"{self._kind}_{digest}.npy"
            try:
                if path.exists():
                    matrix = np.load(path)
                else:
                    matrix = self._embed_all([self._text(r) for r in ordered], "search_document: ")
                    self._cache_dir.mkdir(parents=True, exist_ok=True)
                    # Canlıda birden fazla uvicorn süreci aynı dosyayı yazabilir:
                    # geçici ada yazıp atomik taşı, yarım dosya okunmasın.
                    tmp = path.with_name(f"{path.stem}.{os.getpid()}.tmp.npy")
                    np.save(tmp, matrix)
                    os.replace(tmp, path)
            except Exception:
                logger.exception("Katalog vektörleri hazırlanamadı (%s)", self._kind)
                self._failed_at = time.monotonic()
                return False
            self._ids = [r.id for r in ordered]
            self._matrix = matrix
            self._digest = digest
            self._failed_at = None
            return True

    def nearest(self, rows: Sequence[Any], query: str, k: int) -> list[int]:
        """`query`ye anlamca en yakın `k` satırın id'si; kullanılamıyorsa []."""
        if not query.strip() or not rows or not self._ensure(rows):
            return []
        try:
            vector = self._embed_all([query], "search_query: ")[0]
        except Exception:
            logger.exception("Sorgu gömülemedi (%s)", self._kind)
            self._failed_at = time.monotonic()
            return []
        assert self._matrix is not None
        scores = self._matrix @ vector
        top = np.argsort(-scores)[:k]
        return [self._ids[i] for i in top]
