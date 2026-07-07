from functools import lru_cache
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.rag.embedder import get_embeddings

_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=500, chunk_overlap=80, separators=["\n\n", "\n", ". ", " "]
)


def _load_documents(category_dir: Path) -> list[Document]:
    documents = []
    for path in sorted(category_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        for chunk in _SPLITTER.split_text(text):
            documents.append(Document(page_content=chunk, metadata={"source": path.name}))
    return documents


@lru_cache
def get_vector_store(category: str) -> FAISS:
    """category ('nutrition'/'exercise') dizinindeki markdown dosyalarından FAISS index
    döner. Disk'te kayıtlı index varsa onu yükler, yoksa embedding üretip diske kaydeder
    (her istek için yeniden embed etmemek için)."""
    settings = get_settings()
    index_dir = Path(settings.faiss_index_path) / category
    embeddings = get_embeddings()

    if index_dir.exists():
        return FAISS.load_local(str(index_dir), embeddings, allow_dangerous_deserialization=True)

    category_dir = Path(settings.knowledge_base_path) / category
    documents = _load_documents(category_dir)
    if not documents:
        raise ValueError(f"Bilgi tabanında '{category}' için içerik bulunamadı: {category_dir}")

    store = FAISS.from_documents(documents, embeddings)
    index_dir.parent.mkdir(parents=True, exist_ok=True)
    store.save_local(str(index_dir))
    return store
