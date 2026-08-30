from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    # 2026-08-30 güvenlik denetimi: sınırsızdı - her mesaj gerçek bir LLM
    # isteğini tetiklediği için (bkz. chat_router.py rate-limit yorumu) çok
    # büyük tek bir mesaj hem gereksiz LLM/kaynak maliyeti hem de
    # gerekçesiz derecede büyük bir sohbet geçmişi satırı demek. 4000 karakter
    # normal/hatta uzunca bir kullanıcı mesajını rahatça kapsıyor.
    message: str = Field(max_length=4000)


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
