from functools import lru_cache

from langchain_ollama import ChatOllama

from app.config import get_settings


@lru_cache
def get_llm() -> ChatOllama:
    settings = get_settings()
    return ChatOllama(
        model=settings.llm_model_name,
        base_url=settings.ollama_base_url,
        temperature=0.3,
    )
