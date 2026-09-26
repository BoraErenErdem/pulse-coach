"""Bilgi tabanı vektör deposu - doğrudan faiss-cpu (2026-09-26).

Önceden `langchain_community.vectorstores.FAISS` kullanılıyordu: paket artık
bakımı bırakılmış (sunset) durumda ve diskteki index'i pickle ile yüklüyordu
(`allow_dangerous_deserialization=True` - index dizinine yazabilen biri kod
çalıştırabilirdi). Burada aynı arama (IndexFlatL2, gömme vektörleri
normalize edilmeden - LangChain'in varsayılanı) tutuluyor; belgeler düz JSON.

Eski biçimdeki (index.pkl) bir dizin görülürse bir kez yeniden gömülür.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import faiss
import numpy as np
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.rag.embedder import get_embeddings

_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=80, separators=["\n\n", "\n", ". ", " "])
_INDEX_FILE = "index.faiss"
_DOCS_FILE = "docs.json"
_LEGACY_PICKLE = "index.pkl"


def _load_documents(category_dir: Path) -> list[Document]:
    documents = []
    for path in sorted(category_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        for chunk in _SPLITTER.split_text(text):
            documents.append(Document(page_content=chunk, metadata={"source": path.name}))
    return documents


def _as_matrix(vectors: list[list[float]]) -> np.ndarray:
    return np.asarray(vectors, dtype="float32")


@dataclass
class VectorStore:
    index: faiss.Index
    documents: list[Document]
    embeddings: Embeddings

    @classmethod
    def from_documents(cls, documents: list[Document], embeddings: Embeddings) -> "VectorStore":
        vectors = _as_matrix(embeddings.embed_documents([doc.page_content for doc in documents]))
        index = faiss.IndexFlatL2(vectors.shape[1])
        index.add(vectors)  # pyright: ignore[reportCallIssue] - faiss'in SWIG imzası tip ipucu içermiyor
        return cls(index=index, documents=documents, embeddings=embeddings)

    @classmethod
    def load(cls, index_dir: Path, embeddings: Embeddings) -> "VectorStore":
        index = faiss.read_index(str(index_dir / _INDEX_FILE))
        raw = json.loads((index_dir / _DOCS_FILE).read_text(encoding="utf-8"))
        documents = [Document(page_content=item["page_content"], metadata=item["metadata"]) for item in raw]
        if index.ntotal != len(documents):
            raise ValueError(f"Bozuk vektör index'i: {index.ntotal} vektör, {len(documents)} belge ({index_dir})")
        return cls(index=index, documents=documents, embeddings=embeddings)

    def save(self, index_dir: Path) -> None:
        index_dir.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(index_dir / _INDEX_FILE))
        payload = [{"page_content": doc.page_content, "metadata": doc.metadata} for doc in self.documents]
        (index_dir / _DOCS_FILE).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        (index_dir / _LEGACY_PICKLE).unlink(missing_ok=True)

    def similarity_search_with_score(self, query: str, k: int = 4) -> list[tuple[Document, float]]:
        vector = _as_matrix([self.embeddings.embed_query(query)])
        distances, ids = self.index.search(vector, min(k, self.index.ntotal))  # pyright: ignore[reportCallIssue]
        return [(self.documents[i], float(d)) for d, i in zip(distances[0], ids[0]) if i != -1]

    def similarity_search(self, query: str, k: int = 4) -> list[Document]:
        return [doc for doc, _ in self.similarity_search_with_score(query, k)]


@lru_cache
def get_vector_store(category: str) -> VectorStore:
    """category ('nutrition'/'exercise') dizinindeki markdown dosyalarından vektör
    deposu döner. Diskte kayıtlı index varsa onu yükler, yoksa gömme üretip diske
    kaydeder (her istek için yeniden gömmemek için)."""
    settings = get_settings()
    index_dir = Path(settings.faiss_index_path) / category
    embeddings = get_embeddings()

    if (index_dir / _DOCS_FILE).exists():
        return VectorStore.load(index_dir, embeddings)

    category_dir = Path(settings.knowledge_base_path) / category
    documents = _load_documents(category_dir)
    if not documents:
        raise ValueError(f"Bilgi tabanında '{category}' için içerik bulunamadı: {category_dir}")

    store = VectorStore.from_documents(documents, embeddings)
    store.save(index_dir)
    return store
