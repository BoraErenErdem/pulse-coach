from functools import lru_cache
from langchain_ollama import ChatOllama
from app.config import get_settings


@lru_cache
def get_llm(model_name: str | None = None, reasoning: bool = True) -> ChatOllama:
    """model_name verilirse settings.llm_model_name yerine onu kullanır
    (model karşılaştırma eval script'i ve photo_meal_service'in ayrı vision
    modeli için — prod sohbet akışı hep None geçer). reasoning=False,
    "thinking" desteklemeyen modeller için gerekli (ör. gemma3:4b —
    reasoning=True ile çağrılırsa Ollama 400 "does not support thinking"
    hatası döner, bkz. photo_meal_service.py)."""
    settings = get_settings()
    return ChatOllama(
        model=model_name or settings.llm_model_name,
        base_url=settings.ollama_base_url,
        temperature=0.3,
        num_predict=settings.llm_num_predict,
        num_ctx=settings.llm_num_ctx,
        keep_alive=settings.llm_keep_alive,
        reasoning=reasoning,
    )
