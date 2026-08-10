from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.models.user_profile import UserProfile
from app.services import profile_service
from app.services.fuzzy_match import tr_lower

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


def _normalize(value: str, keyword_map: dict[str, list[str]]) -> str | None:
    """Serbest metni kanonik bir değere eşler, hiçbiri eşleşmezse None döner
    (tool bu durumda alanı güncellemeden kullanıcıyı bilgilendirir)."""
    # Düz .lower() Türkçe büyük "İ"/"I"yi yanlış çeviriyor (bkz. proje
    # belleği - bu bug sınıfı birkaç kez ayrı yerlerde bulundu) - kullanıcı
    # "AKTİF"/"SAĞLIKLI YAŞAM" gibi büyük harfle yazarsa tr_lower olmadan
    # aşağıdaki anahtar kelime eşleşmesi sessizce kaçırılıyordu.
    lowered = tr_lower(value.strip())
    for canonical, keywords in keyword_map.items():
        if lowered == canonical or any(keyword in lowered for keyword in keywords):
            return canonical
    return None


def _format_profile(profile: UserProfile | None) -> str:
    if profile is None:
        return "Kullanıcının henüz kaydedilmiş bir profili yok."
    parts = [
        f"Hedef: {profile.goal or 'belirtilmemiş'}, "
        f"Aktivite seviyesi: {profile.activity_level or 'belirtilmemiş'}, "
        f"Kısıtlamalar: {profile.dietary_restrictions or 'belirtilmemiş'}"
    ]
    if profile.target_weight_kg is not None:
        parts.append(f"Hedef kilo: {profile.target_weight_kg} kg")
    if any(
        getattr(profile, field) is not None
        for field in ("daily_calorie_goal", "daily_protein_goal_g", "daily_carbs_goal_g", "daily_fat_goal_g")
    ):
        parts.append(
            f"Günlük beslenme hedefi: {profile.daily_calorie_goal or '?'} kcal, "
            f"{profile.daily_protein_goal_g or '?'}g protein, "
            f"{profile.daily_carbs_goal_g or '?'}g karbonhidrat, "
            f"{profile.daily_fat_goal_g or '?'}g yağ"
        )
    return " ".join(parts)


def build_profile_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def get_user_profile() -> str:
        """Kullanıcının kayıtlı profilini (hedef, aktivite seviyesi, kısıtlamalar,
        hedef kilo, günlük beslenme hedefleri) getirir."""
        return _format_profile(profile_service.get_profile(db, user_id))

    @tool
    def update_user_profile(
        goal: str | None = None,
        activity_level: str | None = None,
        dietary_restrictions: str | None = None,
        target_weight_kg: float | None = None,
        daily_calorie_goal: float | None = None,
        daily_protein_goal_g: float | None = None,
        daily_carbs_goal_g: float | None = None,
        daily_fat_goal_g: float | None = None,
    ) -> str:
        """Kullanıcının hedefini, aktivite seviyesini, kısıtlamalarını (alerji,
        vejetaryen vb.), hedef kilosunu ve/veya günlük beslenme hedeflerini
        (kalori/protein/karbonhidrat/yağ) kaydeder ya da günceller. Kullanıcının
        kendi cümlesini/ifadesini olduğu gibi ilet (örn. goal='kilo vermek
        istiyorum', activity_level='haftada 3 gün spor yapıyorum') — serbest
        metin kabul edilir, ayrıca bir formata çevirmene gerek yok. Hedef kilo
        ve beslenme hedefleri sayısal olmalı (ör. '85 kiloya inmek istiyorum'
        dediyse target_weight_kg=85). Sadece belirtilen alanlar güncellenir,
        diğerleri olduğu gibi kalır."""
        normalized_goal = _normalize(goal, _GOAL_KEYWORDS) if goal is not None else None
        normalized_activity = _normalize(activity_level, _ACTIVITY_KEYWORDS) if activity_level is not None else None

        warnings = []
        if goal is not None and normalized_goal is None:
            warnings.append(f"'{goal}' hedefi net anlaşılamadı, hedef güncellenmedi.")
        if activity_level is not None and normalized_activity is None:
            warnings.append(f"'{activity_level}' aktivite seviyesi net anlaşılamadı, güncellenmedi.")

        profile = profile_service.update_profile(
            db,
            user_id,
            goal=normalized_goal,
            activity_level=normalized_activity,
            dietary_restrictions=dietary_restrictions,
            target_weight_kg=target_weight_kg,
            daily_calorie_goal=daily_calorie_goal,
            daily_protein_goal_g=daily_protein_goal_g,
            daily_carbs_goal_g=daily_carbs_goal_g,
            daily_fat_goal_g=daily_fat_goal_g,
        )
        result = f"Profil güncellendi. {_format_profile(profile)}"
        if warnings:
            result += " " + " ".join(warnings)
        return result

    return [get_user_profile, update_user_profile]
