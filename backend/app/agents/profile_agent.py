from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session
from app.models.user_profile import UserProfile
from app.services import calorie_recommendation_service, profile_service, progress_service
from app.services.fuzzy_match import tr_lower

# İngilizce ifadeler 2026-10-06'da eklendi (canlı test): EN kullanıcı "I want to lose
# some fat" dediğinde hiçbir anahtar eşleşmiyor, hedef hiç kaydedilmiyordu. Sıra
# önemli (ilk eşleşen kazanır): "inactive" -> sedentary, "lightly active" -> light.
_GOAL_KEYWORDS = {
    "weight_loss": [
        "kilo ver", "zayıfla", "yağ yak", "kilo azalt", "yağ kayb", "yağ at", "incel",
        "lose weight", "lose some weight", "lose fat", "lose some fat", "fat loss", "weight loss",
        "burn fat", "slim down", "get lean",
    ],
    "muscle_gain": [
        "kas yap", "kilo al", "bulk", "kas kütlesi", "güçlen",
        "build muscle", "gain muscle", "muscle gain", "gain weight", "get stronger", "put on muscle",
    ],
    "general_health": [
        "genel sağlık", "sağlıklı yaşam", "form", "fit kal",
        "general health", "stay healthy", "be healthier", "stay fit", "maintain",
    ],
}
_ACTIVITY_KEYWORDS = {
    "sedentary": ["hareketsiz", "masa başı", "sedanter", "sedentary", "inactive", "desk job"],
    "light": ["hafif", "az hareket", "lightly active", "light"],
    "moderate": ["orta", "haftada birkaç", "moderate", "few times a week"],
    "active": ["aktif", "yoğun", "sporcu", "her gün", "very active", "active", "athlete", "every day"],
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


def _body_facts(db: Session, user_id: int, profile: UserProfile | None) -> str:
    """Kişiye özel hesap (protein/kalori ihtiyacı) için güncel kilo ve vücut
    bilgileri. Canlı testte bulundu (2026-09-26): "günlük ne kadar protein
    almalıyım" sorusunda model kiloyu bilmediği için "85 kg isen" diye
    varsayımla hesapladı. Doğum yılı ve cinsiyet BİLEREK yok: KVKK metni
    bunları yalnız kalori önerisi amacıyla sayıyor (bkz. mobile/app/kvkk.tsx)."""
    facts = []
    weight = progress_service.get_latest_weight(db, user_id)
    if weight is not None:
        facts.append(f"Güncel kilo: {weight:g} kg")
    if profile is not None and profile.height_cm is not None:
        facts.append(f"Boy: {profile.height_cm:g} cm")
    return (", ".join(facts) + ".") if facts else ""


def _format_profile(profile: UserProfile | None, body_facts: str = "") -> str:
    if profile is None:
        return ("Kullanıcının henüz kaydedilmiş bir profili yok. " + body_facts).strip()
    parts = [
        f"Hedef: {profile.goal or 'belirtilmemiş'}, "
        f"Aktivite seviyesi: {profile.activity_level or 'belirtilmemiş'}, "
        f"Kısıtlamalar: {profile.dietary_restrictions or 'belirtilmemiş'}"
    ]
    if profile.target_weight_kg is not None:
        parts.append(f"Hedef kilo: {profile.target_weight_kg} kg")
    if profile.target_waist_cm is not None:
        parts.append(f"Hedef bel çevresi: {profile.target_waist_cm} cm")
    if profile.target_body_fat_pct is not None:
        parts.append(f"Hedef vücut yağ oranı: %{profile.target_body_fat_pct}")
    if profile.weekly_workout_goal_days is not None:
        parts.append(f"Haftalık antrenman hedefi: haftada {profile.weekly_workout_goal_days} gün")
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
    if body_facts:
        parts.append(body_facts)
    return " ".join(parts)


# Canlı test (2026-09-28): "kilo vermek için kaç kalori almalıyım" sorusunda koç
# sayı vermeyip diyetisyene yönlendirdi. Artık uygulamanın Beslenme hedef
# sayfasındaki önerinin AYNISI verilir. Yaş ve cinsiyet koça GİTMEZ (KVKK amacı
# kalori önerisi; koç yalnız sonucu görür, bkz. _body_facts).
_MISSING_FIELD_TEXT = {
    "height": "boy",
    "birth_year": "doğum yılı",
    "sex": "cinsiyet",
    "activity_level": "aktivite seviyesi",
    "weight": "kilo",
}
_GOAL_TEXT = {"weight_loss": "kilo verme", "muscle_gain": "kas yapma", "general_health": "kiloyu koruma"}


def _format_recommendation(rec: dict) -> str:
    if not rec["available"]:
        missing = ", ".join(_MISSING_FIELD_TEXT[m] for m in rec["missing"])
        where = []
        if {"height", "birth_year", "sex"} & set(rec["missing"]):
            where.append("boy/doğum yılı/cinsiyet: Profil > Hesap ve Ayarlar > Vücut Bilgilerin")
        if "activity_level" in rec["missing"]:
            where.append("aktivite seviyesi: Profil > Hesap ve Ayarlar > Hedef ve Koç (ya da bana söyleyebilir)")
        if "weight" in rec["missing"]:
            where.append("kilo: bana söyleyebilir ya da İlerleme sekmesinden girebilir")
        # Boy/doğum yılı/cinsiyeti koç kaydedemez (update_user_profile'da yok) - 2026-09-29
        # eval: koç bunları sohbette istedi; kullanıcı yazsaydı hiçbir yere kaydedilmeyecekti.
        not_in_chat = (
            " Boy, doğum yılı ve cinsiyeti sohbetten KAYDEDEMEZSİN: bunları kullanıcıdan mesajla isteme."
            if {"height", "birth_year", "sex"} & set(rec["missing"])
            else ""
        )
        return (
            f"Kişisel öneri hesaplanamadı, eksik bilgi: {missing}. Kişisel sayı uydurma.{not_in_chat} "
            f"Kullanıcıya eksikleri uygulamada nereye gireceğini söyle ({'; '.join(where)}); girince "
            "sorusunu tekrar sorabilir ve öneriyi Beslenme sekmesindeki günlük hedef sayfasında da görür."
        )
    adjustment = rec["adjustment_kcal"]
    adjustment_text = f"{adjustment:+d} kcal" if adjustment else "fark yok"
    return (
        "KİŞİSEL ÖNERİ (uygulamanın hesabı: Mifflin-St Jeor bazal metabolizma x aktivite katsayısı, "
        f"son kilo kaydıyla): günde yaklaşık {rec['calories']} kcal - günlük harcaması ~{rec['tdee']} kcal, "
        f"{_GOAL_TEXT.get(rec['goal'], rec['goal'])} hedefi için {adjustment_text}. "
        f"Makrolar: {rec['protein_g']} g protein, {rec['carbs_g']} g karbonhidrat, {rec['fat_g']} g yağ. "
        "Bu sayıları kullanıcıya doğrudan ver; bunun bir başlangıç tahmini olduğunu ve kilo değişimine göre "
        "ayarlanabileceğini tek cümleyle söyle, diyetisyene yönlendirmeyle sayı vermekten kaçınma. "
        "İsterse bu öneriyi Beslenme sekmesindeki günlük hedef sayfasından tek dokunuşla hedef yapabilir."
    )


def build_profile_tools(db: Session, user_id: int) -> list[BaseTool]:
    @tool
    def get_user_profile() -> str:
        """Kullanıcının kayıtlı profilini (hedef, aktivite seviyesi, kısıtlamalar,
        hedef kilo, hedef bel çevresi, hedef vücut yağ oranı, günlük beslenme
        hedefleri, haftalık antrenman günü hedefi) ve güncel kilo ile boyu
        getirir. Kişiye özel ihtiyaç sorularında ("ne kadar
        protein/kalori almalıyım") hesabı bu değerlerle yap."""
        profile = profile_service.get_profile(db, user_id)
        return _format_profile(profile, _body_facts(db, user_id, profile))

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
        target_waist_cm: float | None = None,
        target_body_fat_pct: float | None = None,
        weekly_workout_goal_days: int | None = None,
    ) -> str:
        """Kullanıcının hedefini, aktivite seviyesini, kısıtlamalarını (alerji,
        vejetaryen vb.), hedef kilosunu, hedef bel çevresini, hedef vücut yağ
        oranını ve/veya günlük beslenme hedeflerini
        (kalori/protein/karbonhidrat/yağ) kaydeder ya da günceller. Kullanıcının
        kendi cümlesini/ifadesini olduğu gibi ilet (örn. goal='kilo vermek
        istiyorum', activity_level='haftada 3 gün spor yapıyorum') — serbest
        metin kabul edilir, ayrıca bir formata çevirmene gerek yok. Hedef kilo
        ve beslenme hedefleri sayısal olmalı (ör. '85 kiloya inmek istiyorum'
        dediyse target_weight_kg=85). Hedef bel çevresi santimetre cinsinden
        (ör. 'belimi 85 cm'ye indirmek istiyorum' -> target_waist_cm=85), hedef
        vücut yağ oranı yüzde olarak (ör. 'yağ oranımı %18'e düşürmek istiyorum'
        -> target_body_fat_pct=18) verilir. Haftalık antrenman hedefi haftada
        kaç GÜN antrenman yapmak istediğidir, 1-7 arası tam sayı (ör. 'haftada
        4 gün spora gitmek istiyorum' -> weekly_workout_goal_days=4). Sadece belirtilen alanlar
        güncellenir, diğerleri olduğu gibi kalır."""
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
            target_waist_cm=target_waist_cm,
            target_body_fat_pct=target_body_fat_pct,
            weekly_workout_goal_days=weekly_workout_goal_days,
        )
        result = f"Profil güncellendi. {_format_profile(profile)}"
        if warnings:
            result += " " + " ".join(warnings)
        return result

    @tool
    def get_calorie_recommendation(goal: str | None = None) -> str:
        """Kullanıcının KENDİ günlük kalori ve protein/karbonhidrat/yağ ihtiyacını
        hesaplar (örn. 'kilo vermek için günde kaç kalori almalıyım', 'kas yapmak için
        ne kadar yemeliyim'). Kullanıcı soruda bir hedef belirtiyorsa goal'e onu ilet
        ('kilo vermek', 'kas yapmak', 'korumak'); belirtmiyorsa boş bırak, profildeki
        hedef kullanılır."""
        normalized_goal = _normalize(goal, _GOAL_KEYWORDS) if goal else None
        if normalized_goal is None and goal and any(w in tr_lower(goal) for w in ("koru", "maintain", "sabit")):
            normalized_goal = "general_health"
        return _format_recommendation(calorie_recommendation_service.get_recommendation(db, user_id, normalized_goal))

    return [get_user_profile, update_user_profile, get_calorie_recommendation]
