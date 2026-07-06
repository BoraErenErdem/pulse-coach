from datetime import datetime, timezone
from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.models.user_profile import UserProfile

_GOAL_KEYWORDS = {
    "weight_loss": ["kilo ver", "zayıfla", "yağ yak", "kilo azalt"],
    "muscle_gain": ["kas yap", "kilo al", "bulk", "kas kütlesi", "güçlen"],
    "general_health": ["genel sağlık", "sağlıklı yaşam", "form", "fit kal"],
}
_ACTIVITY_KEYWORDS = {
    "sedentary": ["hareketsiz", "masa başı", "sedanter"],
    "light": ["hafif", "az hareket"],
    "moderate": ["orta", "haftada birkaç"],
    "active": ["aktif", "yoğun", "sporcu", "her gün"],
}


def _normalize(value: str, keyword_map: dict[str, list[str]]) -> str:
    lowered = value.strip().lower()
    for canonical, keywords in keyword_map.items():
        if lowered == canonical or any(keyword in lowered for keyword in keywords):
            return canonical
    return lowered


def _format_profile(profile: UserProfile | None) -> str:
    if profile is None:
        return "Kullanıcının henüz kaydedilmiş bir profili yok."
    return (
        f"Hedef: {profile.goal or 'belirtilmemiş'}, "
        f"Aktivite seviyesi: {profile.activity_level or 'belirtilmemiş'}, "
        f"Kısıtlamalar: {profile.dietary_restrictions or 'belirtilmemiş'}"
    )


def build_profile_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def get_user_profile() -> str:
        """Kullanıcının kayıtlı profilini (hedef, aktivite seviyesi, kısıtlamalar) getirir."""
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        return _format_profile(profile)

    @tool
    def update_user_profile(
        goal: str | None = None,
        activity_level: str | None = None,
        dietary_restrictions: str | None = None,
    ) -> str:
        """Kullanıcının hedefini, aktivite seviyesini ve/veya kısıtlamalarını (alerji,
        vejetaryen vb.) kaydeder ya da günceller. Kullanıcının kendi cümlesini/ifadesini
        olduğu gibi ilet (örn. goal='kilo vermek istiyorum', activity_level='haftada 3 gün
        spor yapıyorum') — serbest metin kabul edilir, ayrıca bir formata çevirmene gerek yok.
        Sadece belirtilen alanlar güncellenir, diğerleri olduğu gibi kalır."""
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if profile is None:
            profile = UserProfile(user_id=user_id)
            db.add(profile)

        if goal is not None:
            profile.goal = _normalize(goal, _GOAL_KEYWORDS)
        if activity_level is not None:
            profile.activity_level = _normalize(activity_level, _ACTIVITY_KEYWORDS)
        if dietary_restrictions is not None:
            profile.dietary_restrictions = dietary_restrictions
        profile.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(profile)
        return f"Profil güncellendi. {_format_profile(profile)}"

    return [get_user_profile, update_user_profile]
