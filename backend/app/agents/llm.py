import logging
from functools import lru_cache

from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama

from app.config import get_settings

logger = logging.getLogger("app.llm.usage")

# İstem bağlamın bu oranını geçince uyarı: Ollama num_ctx'i aşan istemi
# SESSİZCE baştan kırpar (sistem istemi/araç şemaları gider), model bozuk
# davranır ama hata dönmez.
_CTX_WARN_RATIO = 0.8


class _TokenUsageLog(BaseCallbackHandler):
    """Her model çağrısının istem/çıktı token sayısını loglar (2026-09-30) -
    num_ctx ve GPU kapasitesi kararları gerçek ölçüme dayansın, canlıda da
    bağlam taşması görünür olsun."""

    def __init__(self, num_ctx: int) -> None:
        self.num_ctx = num_ctx

    def on_llm_end(self, response, **kwargs) -> None:  # noqa: ARG002 - arayüz
        for generations in response.generations:
            for generation in generations:
                usage = getattr(getattr(generation, "message", None), "usage_metadata", None)
                if not usage:
                    continue
                prompt_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
                info = getattr(generation, "generation_info", None) or {}
                model = info.get("model") or info.get("model_name") or "?"
                if prompt_tokens > self.num_ctx * _CTX_WARN_RATIO:
                    logger.warning(
                        "LLM istemi bağlamın %%%d'ini aşıyor: model=%s prompt=%d num_ctx=%d",
                        int(_CTX_WARN_RATIO * 100), model, prompt_tokens, self.num_ctx,
                    )
                logger.info("llm_usage model=%s prompt=%d output=%d", model, prompt_tokens, output_tokens)


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
        client_kwargs={"timeout": settings.llm_request_timeout_s},
        callbacks=[_TokenUsageLog(settings.llm_num_ctx)],
    )


@lru_cache
def get_choice_llm() -> ChatOllama:
    """Egzersiz adlandırma (bkz. services/exercise_resolver.py): kısa JSON yanıt,
    sıcaklık 0, düşünme kapalı - görev kısa (ifade -> standart İngilizce ad) ve
    boşta 4 adlık bir istek ~1.5 sn sürüyor; düşünme açıkken aday seçimi denemesi
    grup başına ~25 sn idi."""
    settings = get_settings()
    return ChatOllama(
        model=settings.llm_model_name,
        base_url=settings.ollama_base_url,
        temperature=0,
        format="json",
        num_predict=settings.llm_num_predict,
        num_ctx=settings.llm_num_ctx,
        keep_alive=settings.llm_keep_alive,
        reasoning=False,
        client_kwargs={"timeout": settings.llm_request_timeout_s},
        callbacks=[_TokenUsageLog(settings.llm_num_ctx)],
    )
