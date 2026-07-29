from functools import lru_cache
from langchain_ollama import ChatOllama
from app.config import get_settings


@lru_cache
def get_llm(model_name: str | None = None) -> ChatOllama:
    """model_name verilirse settings.llm_model_name yerine onu kullanır
    (model karşılaştırma eval script'i için — prod akışı hep None geçer)."""
    settings = get_settings()
    return ChatOllama(
        model=model_name or settings.llm_model_name,
        base_url=settings.ollama_base_url,
        temperature=0.3,
        num_predict=settings.llm_num_predict,
        num_ctx=8192,
        keep_alive=settings.llm_keep_alive,
        reasoning=True,
    )
