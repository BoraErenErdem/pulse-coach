"""passlib -> bcrypt ve langchain-community FAISS -> doğrudan faiss geçişi (2026-09-26)."""

import json

from langchain_core.embeddings import Embeddings

from app.auth.security import hash_password, verify_password
from app.rag.vector_store import VectorStore


def test_hash_and_verify_roundtrip():
    hashed = hash_password("Çok-Gizli şifre 1")
    assert hashed.startswith("$2b$12$")
    assert verify_password("Çok-Gizli şifre 1", hashed)
    assert not verify_password("Çok-Gizli şifre 2", hashed)


def test_passwords_longer_than_72_bytes_use_first_72_bytes():
    # Eski davranış (bcrypt 4.0 + passlib) aynen korunur; bcrypt 5 hata vermez.
    hashed = hash_password("a" * 100)
    assert verify_password("a" * 100, hashed)
    assert verify_password("a" * 72, hashed)


def test_malformed_hash_is_rejected_not_raised():
    assert verify_password("x", "bu-bir-hash-degil") is False


def test_standard_bcrypt_hash_from_other_libraries_verifies():
    # passlib de aynı standart "$2b$" biçimini üretiyordu - geçişten önce kayıt
    # olan kullanıcıların girişi bozulmamalı.
    import bcrypt

    hashed = bcrypt.hashpw(b"eski-sifre-123", bcrypt.gensalt(rounds=4)).decode()
    assert verify_password("eski-sifre-123", hashed)
    assert not verify_password("eski-sifre-124", hashed)


class _FakeEmbeddings(Embeddings):
    """Kelime sayımına dayalı deterministik gömme - Ollama gerektirmez."""

    VOCAB = ["protein", "kalori", "squat", "diz", "su", "uyku"]

    def _vec(self, text: str) -> list[float]:
        lowered = text.lower()
        return [float(lowered.count(word)) for word in self.VOCAB]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


def _docs():
    from langchain_core.documents import Document

    return [
        Document(page_content="Protein ihtiyacı ve protein kaynakları", metadata={"source": "protein.md"}),
        Document(page_content="Squat yaparken diz hizası, diz içe kaçmamalı", metadata={"source": "squat.md"}),
        Document(page_content="Günlük su tüketimi ve uyku", metadata={"source": "su.md"}),
    ]


def test_vector_store_returns_nearest_documents_in_order():
    store = VectorStore.from_documents(_docs(), _FakeEmbeddings())
    results = store.similarity_search("squat diz", k=2)
    assert [doc.metadata["source"] for doc in results][0] == "squat.md"
    assert len(results) == 2
    # k belge sayısından büyükse hata vermez.
    assert len(store.similarity_search("protein", k=10)) == 3


def test_vector_store_saves_without_pickle_and_reloads(tmp_path):
    index_dir = tmp_path / "nutrition"
    index_dir.mkdir()
    (index_dir / "index.pkl").write_bytes(b"eski langchain pickle")
    store = VectorStore.from_documents(_docs(), _FakeEmbeddings())
    store.save(index_dir)

    assert not (index_dir / "index.pkl").exists()
    saved = json.loads((index_dir / "docs.json").read_text(encoding="utf-8"))
    assert saved[0]["metadata"]["source"] == "protein.md"

    loaded = VectorStore.load(index_dir, _FakeEmbeddings())
    assert [d.metadata["source"] for d in loaded.similarity_search("su uyku", k=1)] == ["su.md"]
