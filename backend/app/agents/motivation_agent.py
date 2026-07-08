from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.agents.llm import get_llm
from app.agents.prompts import SAFETY_RULES
from app.services import progress_service

_CHECKIN_SYSTEM_PROMPT = f"""
Sen "Sağlıklı Yaşam Koçu" adlı sağlık/fitness koçluk asistanısın. Sana kullanıcının son 7
günlük ilerleme özeti (ham veri) verilecek. Bunu, kullanıcıya doğrudan proaktif bir
check-in mesajı olarak gönderilecek şekilde 2-3 cümlelik, sıcak ve destekleyici bir
Türkçe mesaja dönüştür.

{SAFETY_RULES}
""".strip()


def build_motivation_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def generate_encouragement() -> str:
        """Kullanıcının son 7 günlük ilerleme verisini (ham veri) getirir. Bu veriyi
        kullanıcıya olduğu gibi gösterme; motivasyon kurallarına uygun, sıcak,
        destekleyici ve asla suçlayıcı/utandırıcı olmayan bir dille yeniden ifade ederek
        yanıtla. Kullanıcı motivasyon, teşvik ya da 'nasıl gidiyorum' türünden bir şey
        istediğinde bu aracı çağır."""
        return progress_service.generate_weekly_summary(db, user_id).as_text()

    @tool
    def generate_checkin_message() -> str:
        """Proaktif bir check-in mesajı için kullanıcının son 7 günlük ilerleme özetini
        (ham veri) getirir. Bu veriyi kullanıcıya olduğu gibi gösterme; motivasyon
        kurallarına uygun, sıcak ve kısa bir check-in mesajına dönüştürerek yanıtla."""
        return progress_service.generate_weekly_summary(db, user_id).as_text()

    return [generate_encouragement, generate_checkin_message]


def render_checkin_message(db: Session, user_id: int) -> str:
    """Proaktif check-in job'ları (APScheduler) tarafından çağrılır: interaktif bir
    sohbet döngüsü olmadığı için haftalık özeti tek seferlik bir LLM çağrısıyla sıcak
    bir check-in mesajına çevirir."""
    summary_text = progress_service.generate_weekly_summary(db, user_id).as_text()
    llm = get_llm()
    response = llm.invoke(
        [SystemMessage(content=_CHECKIN_SYSTEM_PROMPT), HumanMessage(content=summary_text)]
    )
    return response.content
