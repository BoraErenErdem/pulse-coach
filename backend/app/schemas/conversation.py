from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    # 2026-08-30 güvenlik denetimi: sınırsızdı - her mesaj gerçek bir LLM
    # isteğini tetiklediği için (bkz. chat_router.py rate-limit yorumu) çok
    # büyük tek bir mesaj hem gereksiz LLM/kaynak maliyeti hem de asıl önemlisi
    # config.py::llm_num_ctx (20000 token, girdi+çıktı toplam) bütçesini tek
    # başına ciddi tüketebilir - sistem promptu + tool şemaları + sohbet
    # geçmişiyle (bkz. orchestrator.py::_load_history, son 20 mesaj) birleşince
    # 2026-08-05'te canlı olarak yaşanan "done_reason=length, boş content"
    # hatasını (bkz. feedback_llm_tuning_health_coach.md) tekrar tetikleyebilir.
    # 8000 karakter (~1500-2000 kelime) gerçekten uzun/detaylı bir mesajı
    # (ör. bütün günün öğün/antrenman dökümü) rahatça kapsıyor, yine de bu
    # bütçeyi güvenli bir payla koruyor.
    message: str = Field(max_length=8000)


class ChatResponse(BaseModel):
    reply: str
    agent_used: str


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    agent_used: str | None
    timestamp: datetime
