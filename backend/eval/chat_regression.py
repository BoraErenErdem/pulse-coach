"""Sohbet kayıt regresyon değerlendirmesi (2026-09-23).

Neden var: 2026-09-23 denetiminde en kritik hata ("3 set 10 tekrar" -> 1 set
kaydedilip "3 seti kaydettim" denmesi) birim testlerle YAKALANAMADI - model
sadece bazı çalıştırmalarda (~1/4) tanımsız bir parametreyle yanlış aracı
çağırıyordu. Bu script, yaygın kullanıcı cümlelerini GERÇEK modelle (Ollama)
birden çok kez çalıştırıp modelin hangi aracı hangi argümanlarla çağırdığını ve
DB'ye GERÇEKTE ne yazıldığını beklenen sonuçla karşılaştırır.

Kullanım (backend/ içinden, `ollama serve` açıkken):
    python -m eval.chat_regression                # tüm senaryolar, 3 deneme
    python -m eval.chat_regression --trials 5 --only squat_3x10,bench_4x8
    python -m eval.chat_regression --trials 5 --model gemma4:12b   # model karşılaştırma

Güvenlik: geliştirme DB'sinin (katalog verisi için) GEÇİCİ bir KOPYASINDA
çalışır - her deneme yeni bir kullanıcıyla, gerçek DB'ye hiçbir şey yazılmaz.
Sonuç: eval/results/chat_regression_<zaman>.json + terminal özeti. Bir
senaryonun başarı oranı %100'ün altındaysa çıkış kodu 1 (CI/elle takip için).
"""

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def _tr_lower(text: str) -> str:
    # str.lower() "İ"yi noktalı i + birleşik nokta yapar - "izmir" "İzmir köfte"de bulunamıyordu.
    return text.replace("İ", "i").replace("I", "ı").lower()


@dataclass
class Outcome:
    sets: list[tuple[str, int | None, float | None, float | None]]  # (isim, tekrar, kg, dakika)
    meals: list[tuple[str, float]]  # (isim, gram)
    reply: str
    tool_calls: list[tuple[str, dict]]
    # Yeni kayıtların (set oturumu/öğün/elle ilerleme kaydı) kaç gün önceye yazıldığı.
    record_days: list[int] = field(default_factory=list)
    weights: list[float] = field(default_factory=list)  # elle girilen kilo kayıtları
    goals: list[tuple[str, float | None, int | None]] = field(default_factory=list)  # (isim, kg, tekrar)
    moods: list[str] = field(default_factory=list)  # bugünkü ruh hali kaydı (mood_key)


@dataclass
class Scenario:
    key: str
    message: str
    # (başarılı mı, kısa açıklama)
    check: Callable[[Outcome], tuple[bool, str]]
    # Mesajdan önce geçmiş kayıt hazırlar: (db, user_id) -> None.
    setup: Callable | None = None


def _sets_equal(expected: list[tuple[int | None, float | None]]) -> Callable[[Outcome], tuple[bool, str]]:
    """Kayıtlı setlerin (tekrar, kg) listesi sırası önemsiz şekilde beklenene eşit mi."""

    def check(o: Outcome) -> tuple[bool, str]:
        got = sorted(((reps, kg) for _, reps, kg, _ in o.sets), key=str)
        want = sorted(expected, key=str)
        return got == want, f"beklenen {want}, kaydedilen {got}"

    return check


def _sets_named(expected: list[tuple[int | None, float | None]], name_part: str) -> Callable[[Outcome], tuple[bool, str]]:
    """_sets_equal + hepsi `name_part` içeren kanonik isimle kaydedilmiş mi."""
    inner = _sets_equal(expected)

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = inner(o)
        names = sorted({name for name, *_ in o.sets})
        named = bool(o.sets) and all(name_part in name for name in names)
        return ok and named, f"{detail}; isimler {names}"

    return check


def _meal_grams_at_most(needle: str, max_grams: float, inner: Callable[[Outcome], tuple[bool, str]]) -> Callable[[Outcome], tuple[bool, str]]:
    """Porsiyon tahmini: `needle` içeren öğün en fazla `max_grams` gram olmalı."""

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = inner(o)
        grams = [g for name, g in o.meals if needle in _tr_lower(name)]
        return ok and bool(grams) and max(grams) <= max_grams, f"{detail}; {needle} gram {grams} (<= {max_grams})"

    return check


def _meal_grams_at_least(needle: str, min_grams: float, inner: Callable[[Outcome], tuple[bool, str]]) -> Callable[[Outcome], tuple[bool, str]]:
    """Sayılı küçük besinler (zeytin, ceviz...): `needle` içeren öğün en az `min_grams`."""

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = inner(o)
        grams = [g for name, g in o.meals if needle in _tr_lower(name)]
        return ok and bool(grams) and min(grams) >= min_grams, f"{detail}; {needle} gram {grams} (>= {min_grams})"

    return check


def _sets_and_durations(
    expected: list[tuple[int | None, float | None]], minutes: list[float]
) -> Callable[[Outcome], tuple[bool, str]]:
    """Tekrarlı setler (tekrar, kg) VE süreli setler (dakika) birlikte doğru mu."""

    def check(o: Outcome) -> tuple[bool, str]:
        reps = sorted(((r, kg) for _, r, kg, m in o.sets if m is None), key=str)
        durations = sorted(m for *_, m in o.sets if m is not None)
        ok = reps == sorted(expected, key=str) and durations == sorted(minutes)
        return ok, f"beklenen {sorted(expected, key=str)} + {sorted(minutes)} dk, kaydedilen {reps} + {durations} dk"

    return check


def _sessions_across_week_boundary(db, user_id: int) -> None:
    """Geçen hafta 2 oturum (Pazar ve Cumartesi) + bugün 1 oturum: takvim haftasında 1 gün."""
    from datetime import timedelta

    from app.services import workout_service
    from app.services.user_time import local_today
    from app.services.workout_service import SetInput

    today = local_today(None)
    for ago in (0, today.weekday() + 1, today.weekday() + 2):
        workout_service.log_workout_session(
            db, user_id, session_date=today - timedelta(days=ago), sets=[SetInput(exercise_name="Squat", reps=10, weight_kg=60)]
        )


def _this_week_one_day(o: Outcome) -> tuple[bool, str]:
    # "Son 7 günde 3 gün" gibi açıkça etiketlenmiş ek bilgi serbest - o cümleler atılır.
    sentences = re.split(r"(?<=[.!?])\s+", o.reply.lower())
    reply = " ".join(s for s in sentences if not re.search(r"(7|yedi) gün", s))
    says_one = re.search(r"\b(1|bir) gün", reply) is not None
    says_more = re.search(r"\b(2|3|iki|üç) gün", reply) is not None
    return says_one and not says_more and not o.sets, f"1 gün={says_one}, fazlası={says_more}, yeni set={o.sets}"


def _goal_set(o: Outcome, kg: float, reps: int) -> tuple[bool, str]:
    got = [(g[1], g[2]) for g in o.goals]
    return got == [(kg, reps)], f"beklenen hedef [({kg}, {reps})], kaydedilen {o.goals}"


def _one_duration_set(minutes: float) -> Callable[[Outcome], tuple[bool, str]]:
    def check(o: Outcome) -> tuple[bool, str]:
        durations = [m for *_, m in o.sets if m is not None]
        return durations == [minutes], f"beklenen [{minutes}] dk, kaydedilen {durations}"

    return check


def _meals_contain(*needles: str, forbidden: tuple[str, ...] = ()) -> Callable[[Outcome], tuple[bool, str]]:
    """`needles` Türkçe KÖK olmalı (ör. "ekme" - "ekmek" -> "ekmeği" k/ğ
    yumuşaması yüzünden tam kelime eşleşmez). `forbidden`: yanlış katalog
    eşleşmesi işaretleri (ör. "2 yumurta" -> "Yumurta, beyazı")."""

    def check(o: Outcome) -> tuple[bool, str]:
        names = [_tr_lower(name) for name, _ in o.meals]
        missing = [n for n in needles if not any(n in name for name in names)]
        wrong = [f for f in forbidden if any(f in name for name in names)]
        ok = not missing and not wrong and len(o.meals) == len(needles)
        return ok, f"öğünler {o.meals}, eksik {missing}, yanlış eşleşme {wrong}"

    return check


_RELATIVE_DAY_WORDS = {1: ("dün",), 2: ("evvelsi gün", "önceki gün", "2 gün önce")}


def _on_past_day(days: int, inner: Callable[[Outcome], tuple[bool, str]]) -> Callable[[Outcome], tuple[bool, str]]:
    """Geçmiş güne kayıt (days_ago): kayıt doğru, HEPSİ `days` gün önceye yazılmış
    ve yanıt tarihi (ör. "25 Eylül") ya da göreli günü ("dün") anıyor."""
    from datetime import timedelta

    from app.agents.log_date import format_tr_date
    from app.services.user_time import local_today

    def check(o: Outcome) -> tuple[bool, str]:
        inner_ok, inner_detail = inner(o)
        on_day = bool(o.record_days) and all(d == days for d in o.record_days)
        reply = o.reply.lower()
        target = format_tr_date(local_today(None) - timedelta(days=days)).lower()
        mentions = target in reply or any(w in reply for w in _RELATIVE_DAY_WORDS.get(days, ()))
        # "evvelsi gün" kaydına "dün" demek yanlış gün bildirmek (eval 2026-09-27: 5/5).
        wrong_day = days != 1 and re.search(r"\bdün\b", reply) is not None
        ok = inner_ok and on_day and mentions and not wrong_day
        return ok, f"{inner_detail}; gün farkı {o.record_days}, tarih anıldı={mentions}, yanlış 'dün'={wrong_day}"

    return check


def _weight_logged(kg: float) -> Callable[[Outcome], tuple[bool, str]]:
    def check(o: Outcome) -> tuple[bool, str]:
        return o.weights == [kg], f"beklenen kilo [{kg}], kaydedilen {o.weights}"

    return check


def _mixed_day_cycling_and_weight(o: Outcome) -> tuple[bool, str]:
    """Bisiklet dünkü oturum, kilo bugünkü kayıt (record_days: [1 (oturum), 0 (kilo)])."""
    durations = [m for *_, m in o.sets if m is not None]
    ok = durations == [45.0] and o.weights == [83.4] and sorted(o.record_days) == [0, 1]
    return ok, f"süre {durations}, kilo {o.weights}, gün farkları {o.record_days}"


def _nothing_logged_for_future(o: Outcome) -> tuple[bool, str]:
    """"Yarın koşacağım" bir kayıt değil: hiçbir şey yazılmamalı, "kaydettim" denmemeli."""
    claims = "kaydettim" in o.reply.lower() or "kaydedildi" in o.reply.lower()
    ok = not o.sets and not o.meals and not o.weights and not o.record_days and not claims
    return ok, f"set {o.sets}, öğün {o.meals}, kilo {o.weights}, kayıt iddiası={claims}"


def _history(exercise: str, sets: list[tuple[int, float]]) -> Callable:
    """3 gün öncesine geçmiş setler (rekor senaryoları için)."""

    def setup(db, user_id: int) -> None:
        from datetime import date, timedelta

        from app.services import exercise_catalog_service, workout_service
        from app.services.workout_service import SetInput

        # Sohbet aracıyla AYNI katalog eşleşmesi - yoksa geçmiş başka isimde
        # kalır, rekor hiç işaretlenmez.
        match = exercise_catalog_service.match_for_set(db, exercise, None)
        name = exercise_catalog_service.canonical_name(match, exercise)
        workout_service.log_workout_session(
            db,
            user_id,
            session_date=date.today() - timedelta(days=3),
            sets=[
                SetInput(exercise_name=name, reps=reps, weight_kg=kg, exercise_catalog_id=match.id if match else None)
                for reps, kg in sets
            ],
        )

    return setup


def _record_reported(
    expected: list[tuple[int | None, float | None]], forbidden: tuple[str, ...] = (), require_mention: bool = True
) -> Callable:
    """Setler doğru kaydedildi, yanıt yanlış rekor iddiası içermiyor
    (`forbidden`, ör. tekrar rekorunu "ağırlık rekoru" sunmak) ve
    `require_mention` ise rekordan bahsediyor. 2026-09-26 ölçümü (rep_record,
    gemma4:e4b): araç "ağırlık rekoru DEĞİL" derken 0/5 anıldı; "TEKRAR
    REKORU: ..." ile 10 denemenin 8'i açıkça kutladı, 2'si "önemli bir
    ilerleme" diye belirsiz kaldı, 1/15 yanlış ağırlık iddiası. Tekrar
    rekorunda anılma bu yüzden zorunlu değil, detayda raporlanır."""
    sets_ok = _sets_equal(expected)

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = sets_ok(o)
        reply = o.reply.lower()
        # "rekor" kelimesi şart değil - "daha önce yapamadığın kadar tekrar" da kutlama.
        mentions = "rekor" in reply or any(
            p in reply
            for p in ("daha önce yapamadığın", "daha fazla tekrar", "en çok tekrar", "en yüksek tekrar", "en ağır")
        )
        wrong = [f for f in forbidden if f in reply]
        passed = ok and not wrong and (mentions or not require_mention)
        return passed, f"{detail}; rekor anıldı={mentions}, yanlış iddia={wrong}"

    return check


def _outdoor_run(minutes: float) -> Callable[[Outcome], tuple[bool, str]]:
    """Açık hava koşusu esneme/pliometrik bir katalog kaydına bağlanmamalı."""
    duration_ok = _one_duration_set(minutes)

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = duration_ok(o)
        names = [_tr_lower(name) for name, *_ in o.sets]
        wrong = [n for n in names if "esneme" in n or "göğüs" in n or "stretch" in n]
        return ok and not wrong, f"{detail}; isimler {names}"

    return check


def _asks_to_confirm(expected: list[tuple[int | None, float | None]]) -> Callable:
    """Gerçek dışı değer kaydedilir ama kutlanmaz: olumlu rekor iddiası yok, soru var
    (2026-09-26 canlı test: 900 kg squat "ağırlık rekoru" diye kutlandı). "Doğruysa
    inanılmaz bir rekor olur" / "önceki rekorun 110 kg" gibi ifadeler serbest."""
    sets_ok = _sets_equal(expected)

    def check(o: Outcome) -> tuple[bool, str]:
        ok, detail = sets_ok(o)
        reply = o.reply.lower()
        celebrates = any(p in reply for p in ("yeni rekor", "rekorun oldu", "rekor kırdın", "rekorunu kırdın"))
        asks = "?" in reply or any(p in reply for p in ("emin ol", "kontrol et", "kontrol edip", "doğru olduğundan"))
        return ok and not celebrates and asks, f"{detail}; rekor dedi={celebrates}, soru sordu={asks}"

    return check


def _no_new_record_and_honest(o: Outcome) -> tuple[bool, str]:
    """Düzeltme isteği: koçun düzenleme aracı yok - yeni set/öğün yazılmamalı
    (ikinci kayıt olur) ve yanıt düzelttim/güncelledim demeden uygulamaya
    yönlendirmeli (2026-09-26 canlı test: "düzeltiyorum, güncelliyorum" dedi,
    DB değişmedi)."""
    reply = o.reply.lower()
    claims = any(p in reply for p in ("düzelttim", "düzeltiyorum", "güncelledim", "güncelliyorum", "sildim"))
    guides = any(p in reply for p in ("kaydır", "sekme", "geçmiş kayıt", "geçmişine", "geçmişinden"))
    ok = not o.sets and not o.meals and not o.weights and not claims and guides
    return ok, f"yeni set {o.sets}, yeni öğün {o.meals}, kilo {o.weights}, iddia={claims}, yönlendirme={guides}"


def _workout_by_name(
    expected: dict[str, list[list[tuple[int | None, float | None]]]],
    forbidden: tuple[str, ...] = (),
    meals: tuple[str, ...] = (),
) -> Callable[[Outcome], tuple[bool, str]]:
    """Çok hareketli antrenman: her beklenen ad parçası için kaydedilen (tekrar, kg)
    listesi kabul edilen seçeneklerden birine eşit, fazladan hareket yok,
    `forbidden` ad parçaları (yanlış varyant) yok; `meals` verilirse öğünler de."""

    def check(o: Outcome) -> tuple[bool, str]:
        by_name: dict[str, list[tuple[int | None, float | None]]] = {}
        for name, reps, kg, _ in o.sets:
            by_name.setdefault(name, []).append((reps, kg))
        problems = []
        matched: set[str] = set()
        for part, options in expected.items():
            names = [n for n in by_name if part.lower() in n.lower()]
            if len(names) != 1:
                problems.append(f"{part}: {names or 'yok'}")
                continue
            matched.add(names[0])
            got = sorted(by_name[names[0]], key=str)
            if not any(got == sorted(opt, key=str) for opt in options):
                problems.append(f"{part}: {got}")
        extra = sorted(set(by_name) - matched)
        wrong = [n for n in by_name for f in forbidden if f.lower() in n.lower()]
        meal_ok, meal_detail = (True, "")
        if meals:
            meal_ok, meal_detail = _meals_contain(*meals)(o)
        ok = not problems and not extra and not wrong and meal_ok
        return ok, f"sorun {problems}, fazladan {extra}, yanlış varyant {wrong}; {meal_detail}"

    return check


_MOOD_QUESTION_RE = re.compile(r"(işaretle|kaydet|değiştir)\w* ?m[iı]\b")


def _mood_question_asked(o: Outcome) -> tuple[bool, str]:
    """Açık ruh hali ifadesi: kaydetmeden önce sorulur (widget seçimi tahminle ezilmez)."""
    reply = _tr_lower(o.reply)
    asks = "ruh hal" in reply and _MOOD_QUESTION_RE.search(reply) is not None
    claims = re.search(r"işaretle(dim|ndi)", reply) is not None
    ok = not o.moods and asks and not claims
    return ok, f"ruh hali kaydı {o.moods}, soru={asks}, iddia={claims}"


def _mood_logged(key: str) -> Callable[[Outcome], tuple[bool, str]]:
    def check(o: Outcome) -> tuple[bool, str]:
        return o.moods == [key], f"beklenen [{key}], kaydedilen {o.moods}"

    return check


def _no_mood_for_future(o: Outcome) -> tuple[bool, str]:
    reply = _tr_lower(o.reply)
    claims = re.search(r"işaretle(dim|ndi)", reply) is not None
    return not o.moods and not claims, f"ruh hali kaydı {o.moods}, iddia={claims}"


def _history_mood_question(db, user_id: int) -> None:
    """Önceki tur: kullanıcı stresli olduğunu söyledi, koç onay sorusunu sordu."""
    from datetime import timedelta

    from app.models.conversation import Conversation

    now = datetime.now(timezone.utc)
    db.add(Conversation(user_id=user_id, role="user", content="Bugün çok stresliyim, iş çok yoğundu.", timestamp=now - timedelta(minutes=2)))
    db.add(
        Conversation(
            user_id=user_id,
            role="assistant",
            content="Yoğun bir gün geçirmişsin, bunu hissetmen çok doğal. Bugünkü ruh halini \"Düşük\" olarak işaretleyeyim mi?",
            agent_used="mood_support_agent",
            timestamp=now - timedelta(minutes=1),
        )
    )
    db.commit()


def _body_profile(with_weight: bool = True) -> Callable:
    """Kalori önerisi için: 180 cm, 30 yaş, erkek, orta aktif (+ 80 kg)."""

    def setup(db, user_id: int) -> None:
        from app.services import profile_service, progress_service
        from app.services.user_time import local_today

        profile_service.apply_profile_updates(
            db, user_id, {"height_cm": 180, "birth_year": local_today(None).year - 30, "sex": "male", "activity_level": "moderate"}
        )
        if with_weight:
            progress_service.log_progress(db, user_id, weight=80)

    return setup


def _calories_stated(*accepted: str) -> Callable[[Outcome], tuple[bool, str]]:
    """Kişisel öneri sayısı yanıtta (2260 / 2.260 / 2,260), kaçamak yönlendirme yok."""

    def check(o: Outcome) -> tuple[bool, str]:
        compact = re.sub(r"(?<=\d)[.,](?=\d{3})", "", o.reply)
        stated = any(a in compact for a in accepted)
        return stated and not o.weights, f"sayı verildi={stated} ({accepted}), kilo kaydı {o.weights}"

    return check


def _calories_missing_guided(o: Outcome) -> tuple[bool, str]:
    reply = _tr_lower(o.reply)
    guides = "boy" in reply and ("profil" in reply or "vücut bilgi" in reply)
    invented = re.search(r"\b[12][.,]?\d{3}\s*(kcal|kalori)", reply) is not None
    return guides and not invented, f"yönlendirme={guides}, uydurma sayı={invented}"


_PUSH_DAY_MESSAGE = (
    "Selam koç, bugün push antrenmanı yaptım. İlk hareket 3 set dumbell chest press; 70kg 10 tekrar, 75kg 8 tekrar, "
    "80kg 6 tekrar. ikinci hareket 3 set smith machine incline chest press; 70kg 10 tekrar, 70kg 8  tekrar, 75kg 6 "
    "tekrar. üçüncü hareket 3 set peck deck; 65kg 10 tekrar, 70kg 8 tekrar, 75 kg 7 tekrar. Dördüncü hareket 3 set "
    "makinede shoulder press; 60kg 8 tekrar, 65kg 7 tekrar, 70kg 6 tekrar. beşinci hareket 3 drop set dumbell lateral "
    "raise; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18 tekrar. Altıncı hareket 3 set skullcrusher; 35kg 10 tekrar, "
    "40kg 8 tekrar, 45kg 6 tekrar. yedinci hareket 3 set pushdown; 55kg 10 tekrar, 60kg 10 tekrar, 65kg 10 tekrar + "
    "20kg 20 tekrar. Antrenman bittikten sonra eve geldim ve 350gram haşlanmış yeşil mercimek, 280 gram pirinç "
    "pilavı ve 60 gram da yoğurt yedim."
)

SCENARIOS = [
    # 2026-09-29: sohbetten ruh hali kaydı - önce sor, onaydan sonra kaydet.
    Scenario("mood_ask_first", "Bugün işte çok stresli bir gün geçirdim, kafam çok dolu.", _mood_question_asked),
    Scenario("mood_confirm", "Evet, işaretle", _mood_logged("dusuk"), setup=_history_mood_question),
    Scenario("mood_future", "Yarın sınavım var, çok stresli olacağım herhalde", _no_mood_for_future),
    # 2026-09-28 canlı test: koç kalori sayısı vermeyip diyetisyene yönlendirdi.
    Scenario(
        "calorie_personal",
        "Kilo vermek için günde kaç kalori almalıyım, kısaca söyler misin?",
        _calories_stated("2260"),
        setup=_body_profile(),
    ),
    Scenario(
        "calorie_missing_info",
        "Kilo vermek için günde kaç kalori almalıyım?",
        _calories_missing_guided,
    ),
    # 2026-09-28 kullanıcının canlı mesajı: dambıl göğüs pres "Kablo Göğüs Presi"ne,
    # skullcrusher bantlı varyanta, pushdown eğimli kablo varyantına kaydedilmişti.
    Scenario(
        "push_day_full",
        _PUSH_DAY_MESSAGE,
        _workout_by_name(
            {
                "Dambıl Sehpada Göğüs Presi": [[(10, 70.0), (8, 75.0), (6, 80.0)]],
                "Smith Makinesi Eğimli": [[(10, 70.0), (8, 70.0), (6, 75.0)]],
                "Peck Deck": [[(10, 65.0), (8, 70.0), (7, 75.0)]],
                "Makinede Omuz Presi": [[(8, 60.0), (7, 65.0), (6, 70.0)]],
                "Yanal Kaldırma": [[(30, 12.5), (24, 10.0), (18, 7.5)]],
                "EZ Bar Kafatası Ezici": [[(10, 35.0), (8, 40.0), (6, 45.0)]],
                # "+ 20kg 20 tekrar" drop'u ayrı set ya da hiç (3 set) - ikisi de kabul
                "Triceps Aşağı İtme": [[(10, 55.0), (10, 60.0), (10, 65.0), (20, 20.0)], [(10, 55.0), (10, 60.0), (10, 65.0)]],
            },
            forbidden=("Kablo Göğüs", "Bantlı", "Eğimli Triceps", "Halat"),
            meals=("mercimek", "pilav", "yoğurt"),
        ),
    ),
    Scenario(
        "leg_day_pro",
        "Bacak günü bitti: squat 5x5 140 kg, romanian deadlift 4x8 100 kg, leg press 4x12 220 kg, bulgarian split "
        "squat 3x10 her elde 20 kg dambıl, leg curl 3x12 45 kg, calf raise 4x15 80 kg",
        _workout_by_name(
            {
                "Squat (Çömelme)": [[(5, 140.0)] * 5],
                "Romen Deadlift": [[(8, 100.0)] * 4],
                "Bacak Presi": [[(12, 220.0)] * 4],
                "Bulgarian": [[(10, 20.0)] * 3, [(10, 40.0)] * 3],
                "Bacak Kıvırma": [[(12, 45.0)] * 3],
                "Baldır": [[(15, 80.0)] * 4],
            }
        ),
    ),
    Scenario(
        "pull_day_pro",
        "Pull günü: barfiks 4x8, barbell row 4x10 70 kg, lat pulldown 3x12 60 kg, seated cable row 3x12 55 kg, "
        "face pull 3x15 20 kg, hammer curl 3x12 14 kg",
        _workout_by_name(
            {
                "Barfiks": [[(8, None)] * 4],
                "Barbell Kürek": [[(10, 70.0)] * 4],
                "Geniş Tutuş Lat": [[(12, 60.0)] * 3],
                "Oturarak Kablo Kürek": [[(12, 55.0)] * 3],
                "Face Pull": [[(15, 20.0)] * 3],
                "Hammer": [[(12, 14.0)] * 3],
            }
        ),
    ),
    # Yulaf ezmesi kuru tartılır - pişmiş lapaya (76 kcal) gidiyordu (2026-09-28).
    Scenario(
        "meal_oats_dry",
        "kahvaltıda 50 gram yulaf ezmesi, 200 ml süt ve 1 muz yedim",
        _meals_contain("kuru", "süt", "muz", forbidden=("pişmiş",)),
    ),
    Scenario(
        "meal_izmir_pastirma",
        "öğlen 300 gram izmir köfte yedim, akşam da pastırmalı yumurta yaptım 2 yumurtayla",
        _meals_contain("izmir", "pastırmalı", forbidden=("etsiz", "çiğ köfte")),
    ),
    Scenario("squat_3x10", "Bugün squat yaptım: 3 set, 10 tekrar, 62.5 kg", _sets_equal([(10, 62.5)] * 3)),
    Scenario("bench_4x8", "bench press 4x8 70 kilo", _sets_equal([(8, 70.0)] * 4)),
    Scenario(
        "latpulldown_sirasiyla",
        "lat pulldown 3 set 10 tekrar sırasıyla 50, 55, 60 kg",
        _sets_equal([(10, 50.0), (10, 55.0), (10, 60.0)]),
    ),
    Scenario("mekik_bodyweight", "3 set 20 mekik çektim", _sets_equal([(20, None)] * 3)),
    Scenario("single_set", "60 kilo 8 tekrar deadlift yaptım", _sets_equal([(8, 60.0)])),
    Scenario("cardio_duration", "bugün 25 dakika orta tempoda koştum", _one_duration_set(25.0)),
    Scenario("meal_two_items", "kahvaltıda 2 yumurta ve 1 dilim tam buğday ekmeği yedim", _meals_contain("yumurta", "ekme", forbidden=("beyaz", "sarı"))),
    Scenario(
        "rep_record",
        "bugün 100 kilo 10 tekrar deadlift yaptım",
        _record_reported(
            [(10, 100.0)], forbidden=("ağırlık açısından", "ağırlık rekor", "en ağır kaldırış"), require_mention=False
        ),
        setup=_history("Deadlift", [(8, 100.0), (2, 150.0)]),
    ),
    Scenario(
        "weight_record",
        "bench press 72.5 kilo 6 tekrar yaptım",
        _record_reported([(6, 72.5)]),
        setup=_history("Bench Press", [(8, 60.0), (6, 70.0)]),
    ),
    Scenario("outdoor_run", "sabah 30 dakika koştum", _outdoor_run(30.0)),
    Scenario(
        "implausible_weight",
        "Bugün 900 kilo squat yaptım 5 tekrar",
        _asks_to_confirm([(5, 900.0)]),
        setup=_history("Squat", [(5, 110.0)]),
    ),
    Scenario(
        "edit_request",
        "Pardon, az önceki squat 100 kilo olacaktı, düzeltir misin?",
        _no_new_record_and_honest,
        setup=_history("Squat", [(5, 110.0)]),
    ),
    # 2026-09-28 canlı test: koç yeni bisiklet seti + ikinci kilo kaydı açıp
    # "güncellemeler başarıyla yapıldı" dedi.
    Scenario(
        "edit_request_move",
        "Pardon yanlış söylemişim, dünkü bisiklet 45 değil 50 dakikaydı. Bir de kiloyu 27 Eylül'e "
        "yazmışsın, onu bugüne alabilir misin?",
        _no_new_record_and_honest,
    ),
    Scenario("meal_soup_bowl", "Akşam yemeğinde bir tabak mercimek çorbası içtim", _meals_contain("mercimek")),
    # Sık Türk yemekleri sabit eşlemesi (food_aliases.py): "çay" kombuchaya,
    # "tost" tost pastasına, "pilav" karidesli pilava gidiyordu.
    Scenario(
        "meal_tea_toast",
        "kahvaltıda bir bardak çay içtim ve bir kaşarlı tost yedim",
        _meals_contain("çay", "tost", forbidden=("kombucha", "pasta")),
    ),
    Scenario("meal_plain_pilaf", "öğlen bir tabak pilav yedim", _meals_contain("pilav", forbidden=("karides",))),
    # Geçmiş güne kayıt (days_ago): önceden hepsi bugüne yazılıyor, koç yine de "dünkü" diyordu.
    Scenario("past_swim", "dün 40 dakika yüzdüm", _on_past_day(1, _one_duration_set(40.0))),
    Scenario(
        "past_meal",
        "evvelsi gün akşam yemeğinde 200 gram ızgara tavuk göğsü yedim",
        _on_past_day(2, _meals_contain("tavuk")),
    ),
    Scenario("past_weight", "dün sabah tartıldım, 81.5 kiloydum", _on_past_day(1, _weight_logged(81.5))),
    # 2026-09-28 canlı test: "dün ... bisiklet, bu sabah ... kilo" - kilo da düne yazıldı.
    Scenario(
        "mixed_day_weight",
        "Dün akşam 45 dakika tempolu bisiklet sürmüştüm onu da ekle. Bu sabah da tartıldım 83,4 kilo geldim.",
        _mixed_day_cycling_and_weight,
    ),
    Scenario("future_plan", "yarın sabah 5 km koşacağım", _nothing_logged_for_future),
    # 2026-09-27 canlı test: "latpulldown" tek kollu varyanta, "su böreği" toniğe
    # gidiyordu; "bir porsiyon su böreği" 350 g (875 kcal) yazıldı; çay atlandı.
    Scenario(
        "latpulldown_alias",
        "bugün 3 set 10 tekrar 80 kilo latpulldown yaptım",
        _sets_named([(10, 80.0)] * 3, "Geniş Tutuş"),
    ),
    Scenario(
        "meal_borek_portion",
        "öğlen bir porsiyon su böreği yedim yanında bir bardak ayran içtim",
        _meal_grams_at_most("böreği", 250.0, _meals_contain("böreği", "ayran", forbidden=("tonik",))),
    ),
    Scenario(
        "meal_breakfast_tea",
        "sabah kahvaltıda menemen, 2 dilim ekmek ve 2 bardak çay içtim",
        _meals_contain("menemen", "ekmek", "çay"),
    ),
    # 2026-09-28 canlı test: kuvvet + süreli aktivite aynı mesajda - süreli kısım
    # atlanıp yine de "koşu bandını da ekledim" denildi (plank için de aynısı).
    Scenario(
        "strength_plus_cardio",
        "Bugün bench press 4x8 70 kg yaptım, en son 20 dakika koşu bandında orta tempo yürüdüm",
        _sets_and_durations([(8, 70.0)] * 4, [20.0]),
    ),
    Scenario(
        "plank_and_situps",
        "Bugün 10 dakika plank yaptım ve 50 tane mekik çektim",
        _sets_and_durations([(50, None)], [10.0]),
    ),
    # "5 zeytin" 6 g yazıldı (1 zeytin ≈ 3-4 g); "1 dilim beyaz peynir" ≈ 30 g.
    Scenario(
        "meal_olives_count",
        "kahvaltıda 5 zeytin ve 1 dilim beyaz peynir yedim",
        _meal_grams_at_least("zeytin", 12.0, _meals_contain("zeytin", "peynir")),
    ),
    # "önceki gün" = 2 gün önce; ipucuna rağmen model days_ago=1 verdi (artık kod ezer).
    Scenario("past_cycling_onceki", "Önceki gün 45 dakika bisiklet sürdüm, tempolu", _on_past_day(2, _one_duration_set(45.0))),
    Scenario("meal_sweet_tea", "kahvaltıda 2 bardak şekerli çay içtim", _meals_contain("şekerli", forbidden=("soğuk", "yeşil"))),
    # "Bu hafta kaç gün" - koç son 7 günü (geçen haftayı da) sayıyordu (canlı test: pazartesi "6 gün").
    Scenario("this_week_days", "Bu hafta kaç gün antrenman yaptım?", _this_week_one_day, setup=_sessions_across_week_boundary),
    Scenario(
        "exercise_goal_reps",
        "Bench press'te 80 kiloda 5 tekrar hedefi koy",
        lambda o: _goal_set(o, 80.0, 5),
    ),
]


def _prepare_db_copy() -> Path:
    """Geliştirme DB'sinin tutarlı bir kopyası (SQLite online backup API)."""
    source = BACKEND_DIR / "health_coach.db"
    target = Path(tempfile.mkdtemp(prefix="pulsecoach_eval_")) / "eval.db"
    src, dst = sqlite3.connect(source), sqlite3.connect(target)
    src.backup(dst)
    src.close()
    dst.close()
    return target


def run(trials: int, only: set[str] | None, model: str | None = None) -> int:
    db_path = _prepare_db_copy()
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ["SCHEDULER_ENABLED"] = "false"
    if model:
        # Ayar üzerinden: orkestratör, alt ajanlar ve egzersiz adlandırma aynı modeli kullanır
        # (canlıda tek modele geçişin ölçümü).
        os.environ["LLM_MODEL_NAME"] = model

    # DATABASE_URL ayarlandıktan SONRA import - session modül seviyesinde kuruluyor.
    import app.agents.orchestrator as orchestrator
    from app.config import get_settings
    from app.db.session import SessionLocal
    from app.models.exercise_goal import ExerciseGoal
    from app.models.meal_entry import MealEntry
    from app.models.mood_log import MoodLog
    from app.models.progress_log import ProgressLog
    from app.services.user_time import local_today
    from app.models.user import User
    from app.models.user_profile import UserProfile
    from app.models.workout_session import WorkoutSession

    model_name = get_settings().llm_model_name
    print(f"Model: {model_name}")
    scenarios = [s for s in SCENARIOS if only is None or s.key in only]
    results: list[dict] = []
    db = SessionLocal()
    try:
        for scenario in scenarios:
            for trial in range(trials):
                user = User(email=f"eval_{scenario.key}_{trial}_{time.time_ns()}@eval.local", hashed_password="x")
                db.add(user)
                db.commit()
                db.add(UserProfile(user_id=user.id, goal="general_health"))
                db.commit()
                if scenario.setup is not None:
                    scenario.setup(db, user.id)
                history_ids = {ws.id for ws in db.query(WorkoutSession).filter_by(user_id=user.id)}
                history_progress_ids = {p.id for p in db.query(ProgressLog).filter_by(user_id=user.id)}

                calls: list[tuple[str, dict]] = []
                original_create_agent = orchestrator.create_agent

                def spying_create_agent(*args, **kwargs):
                    agent = original_create_agent(*args, **kwargs)
                    original_invoke = agent.invoke

                    def invoke(inputs, config=None):
                        result = original_invoke(inputs, config=config)
                        for message in result["messages"]:
                            for call in getattr(message, "tool_calls", None) or []:
                                calls.append((call["name"], call["args"]))
                        return result

                    agent.invoke = invoke  # pyright: ignore[reportAttributeAccessIssue]  # test casusu
                    return agent

                orchestrator.create_agent = spying_create_agent
                started = time.perf_counter()
                try:
                    reply, _agent = orchestrator.run_orchestrator(db, user.id, scenario.message)
                finally:
                    orchestrator.create_agent = original_create_agent
                elapsed = time.perf_counter() - started

                today = local_today(None)  # eval kullanıcısının saat dilimi yok -> UTC
                new_sessions = [ws for ws in db.query(WorkoutSession).filter_by(user_id=user.id) if ws.id not in history_ids]
                new_meals = db.query(MealEntry).filter_by(user_id=user.id).all()
                manual_progress = [
                    p
                    for p in db.query(ProgressLog).filter_by(user_id=user.id)
                    if p.id not in history_progress_ids and p.source_workout_session_id is None
                ]
                outcome = Outcome(
                    sets=[
                        (s.exercise_name_snapshot, s.reps, s.weight_kg, s.duration_minutes)
                        for ws in db.query(WorkoutSession).filter_by(user_id=user.id)
                        if ws.id not in history_ids
                        for s in ws.sets
                    ],
                    meals=[(m.food_name_snapshot, m.quantity_grams) for m in db.query(MealEntry).filter_by(user_id=user.id)],
                    reply=reply,
                    tool_calls=calls,
                    record_days=[(today - ws.session_date).days for ws in new_sessions]
                    + [(today - m.log_date).days for m in new_meals]
                    + [(today - p.log_date).days for p in manual_progress],
                    weights=[p.weight for p in manual_progress if p.weight is not None],
                    goals=[
                        (g.exercise_name, g.target_weight_kg, g.target_reps)
                        for g in db.query(ExerciseGoal).filter_by(user_id=user.id)
                    ],
                    moods=[m.mood_key for m in db.query(MoodLog).filter_by(user_id=user.id)],
                )
                ok, detail = scenario.check(outcome)
                results.append(
                    {
                        "scenario": scenario.key,
                        "trial": trial,
                        "model": model_name,
                        "ok": ok,
                        "detail": detail,
                        "seconds": round(elapsed, 1),
                        "tool_calls": calls,
                        "reply": reply,
                    }
                )
                print(f"[{'OK ' if ok else 'FAIL'}] {scenario.key} #{trial} ({elapsed:.1f}s) {'' if ok else detail}")
                if ok and "rekor anıldı=False" in detail:
                    print("      (not: rekor yanıtta anılmadı)")
    finally:
        db.close()
        shutil.rmtree(db_path.parent, ignore_errors=True)

    out_dir = BACKEND_DIR / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"chat_regression_{datetime.now():%Y%m%d_%H%M%S}.json"
    out_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nÖzet ({model_name}, senaryo: başarı/deneme):")
    all_passed = True
    for scenario in scenarios:
        rows = [r for r in results if r["scenario"] == scenario.key]
        passed = sum(r["ok"] for r in rows)
        all_passed &= passed == len(rows)
        print(f"  {scenario.key:24s} {passed}/{len(rows)}")
    print(f"\nHam sonuçlar: {out_file}")
    return 0 if all_passed else 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--trials", type=int, default=3, help="senaryo başına deneme sayısı (varsayılan 3)")
    parser.add_argument("--only", type=str, default=None, help="virgülle ayrılmış senaryo anahtarları")
    parser.add_argument("--model", type=str, default=None, help="sohbet modeli (varsayılan: LLM_MODEL_NAME ayarı)")
    args = parser.parse_args()
    only = set(args.only.split(",")) if args.only else None
    sys.exit(run(args.trials, only, args.model))


if __name__ == "__main__":
    main()
