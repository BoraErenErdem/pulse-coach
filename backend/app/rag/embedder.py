from functools import lru_cache
from langchain_ollama import OllamaEmbeddings
from app.config import get_settings


@lru_cache
def get_embeddings() -> OllamaEmbeddings:
    settings = get_settings()
    return OllamaEmbeddings(model=settings.embedding_model_name, base_url=settings.ollama_base_url)
