import logging
import re
from dataclasses import dataclass, field
from datetime import date

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.agents.log_date import past_date_note, resolve_log_date
from app.agents.turn_dedup import TurnDedupGuard
from app.services import (
    exercise_catalog_service,
    exercise_goal_service,
    met_reference,
    profile_service,
    weekly_goal_service,
    workout_service,
)
from app.services.fuzzy_match import tr_lower
from app.services.user_time import user_today

logger = logging.getLogger(__name__)


# Tek bir grubun en fazla kaç birim sete açılacağı - set_count LLM'den geliyor,
# üst sınırı yoktu (halüsinasyonlu bir set_count=100000 o kadar satır yazardı).
MAX_SET_COUNT = 50
# Süre bazlı sette model yoğunluğu bazen göndermiyor; alan açıklaması
# "belirtilmediyse 'orta' varsay" diyor, servis ise None'ı reddediyordu.
DEFAULT_INTENSITY = "orta"


def _resolve_exercise_name(name: str | None, cardio_category: str | None) -> str | None:
    """Boş isim + süre bazlı kardiyo -> kategori etiketi ("kosu" -> "Koşu").
    eval/chat_regression.py ile bulundu (2026-09-26): model kardiyo setinde
    exercise_name'i null/eksik gönderiyordu, zorunlu alan aracı şema hatasıyla
    düşürüyordu ve koç yine de "kaydettim" diyordu."""
    if name and name.strip():
        return name
    if cardio_category:
        return met_reference.CARDIO_CATEGORY_LABELS.get(cardio_category) or met_reference.FLEXIBILITY_CATEGORY_LABELS.get(
            cardio_category, "Kardiyo"
        )
    return None


_MISSING_EXERCISE_NAME = "Kaydedilmedi: egzersiz adı eksik. Kullanıcıya hangi egzersizi yaptığını sor."


class ExerciseSetItem(BaseModel):
    exercise_name: str | None = Field(
        default=None,
        description=(
            "Egzersiz adı, ör. 'Shoulder Press'. KRİTİK — kullanıcı sadece kas "
            "grubunu söyleyip HAREKET TÜRÜNÜ (kaldırma/pres/itme/çekme/curl/fly) "
            "belirtmezse (ör. 'arka omuz için 3x10 sırasıyla 55, 60, 65kg "
            "yaptım'), buraya SADECE kas grubunu yazma — mesajın bağlamından "
            "(aynı mesajdaki komşu egzersizlerden, ör. az önce 'lateral raise' "
            "ve 'front raise' anlatılmışsa bu bir 'kaldırma/raise' serisinin "
            "devamıdır) hareket türünü çıkarıp exercise_name'e EKLE (ör. 'arka "
            "omuz' değil 'arka omuz kaldırma'/'rear delt raise'). Bağlamdan "
            "çıkarım yapılamıyorsa (izole, tek başına bir kas grubu ismi) en "
            "yaygın/varsayılan hareketi varsay (ör. sadece 'biceps' → 'biceps "
            "curl'). Canlı testte bulundu (2026-08-07): salt kas grubu ismiyle "
            "('arka omuz') katalog araması yanlış TÜRDE bir harekete (rear delt "
            "RAISE yerine behind-the-neck PRESS) eşleşebiliyor çünkü ikisi de "
            "'arka'+'omuz' kelimelerini içeriyor — hareket türü kelimesi bu "
            "belirsizliği ortadan kaldırıyor. TERSİ YÖNDE bir hata da mümkün: "
            "kullanıcının kullandığı kelime (ör. 'mekik', 'squat', 'plank') "
            "kataloğun kendisinde ZATEN genel/yalın bir hareket adı olarak "
            "duruyor olabilir — böyle durumda kullanıcı ayrıca bir varyasyon/"
            "ekipman belirtmediyse (ör. 'bisiklet mekiği', 'ön squat') kendi "
            "başına daha SPESİFİK bir varyanta ATLAMA, kullanıcının söylediği "
            "genel terimi olduğu gibi yaz — katalog eşleştirmesi zaten en "
            "yakın/tam eşleşmeyi buluyor. Canlı testte bulundu (2026-09-14): "
            "kullanıcı düz 'mekik' dediğinde katalogtaki tam karşılığı 'Mekik' "
            "yerine 'Crunch (Karın Bisikleti)' gibi daha spesifik bir varyanta "
            "yazılmıştı."
        )
    )
    reps: int | None = Field(
        default=None,
        description=(
            "Tekrar sayısı. SÜRE BAZLI bir aktivite (koşu/bisiklet/yürüyüş/"
            "yüzme/ip atlama/esneklik gibi tekrar sayısı olmayan bir kardiyo "
            "hareketi) ise BUNU BOŞ bırak, bunun yerine duration_minutes "
            "[+intensity+cardio_category] doldur — reps VE duration_minutes "
            "AYNI ANDA doldurulmaz (biri ya da diğeri, ikisi birden değil)."
        ),
    )
    weight_kg: float | None = Field(
        default=None, description="Kullanılan ağırlık (kg); belirtilmemişse boş bırak"
    )
    duration_minutes: float | None = Field(
        default=None,
        description=(
            "SADECE süre bazlı bir kardiyo/esneklik aktivitesi için (ör. "
            "'25 dakika koşu bandında koştum', '30 dk yürüyüş yaptım', "
            "'40 dakika yüzdüm') — dakika cinsinden süre. Bu doluysa reps VE "
            "weight_kg BOŞ bırakılır, bunun yerine intensity VE "
            "cardio_category de MUTLAKA doldurulmalı (ikisi de zorunlu, "
            "eksik bırakılamaz). Canlı testte bulundu (2026-08-31): bu alan "
            "eklenmeden önce sohbet ajanı süre bazlı bir aktiviteyi HİÇBİR "
            "ŞEKİLDE kaydedemiyordu, sessizce atlayıp yine de başarı iddia "
            "edebiliyordu — kullanıcı ne söylerse söylesin süre bazlı bir "
            "aktivite anlatıldığında bu üç alan (duration_minutes, "
            "intensity, cardio_category) MUTLAKA kullanılmalı, asla "
            "atlanmamalı."
        ),
    )
    intensity: str | None = Field(
        default=None,
        description=(
            "duration_minutes doluyken ZORUNLU, aksi halde boş bırak. Şu "
            "üçünden biri: 'hafif', 'orta', 'yogun'. Kullanıcı belirtmediyse "
            "'orta' varsay."
        ),
    )
    cardio_category: str | None = Field(
        default=None,
        description=(
            "duration_minutes doluyken ZORUNLU, aksi halde boş bırak. Şu "
            "kategorilerden biri: 'kosu' (koşu/koşu bandı), 'bisiklet', "
            "'yuruyus' (yürüyüş), 'yuzme', 'ip_atlama', 'esneklik' (germe/"
            "yoga/mobilite), yukarıdakilerden hiçbiri net uymuyorsa "
            "'genel_kardiyo'."
        ),
    )
    # int | None: model bazen alanı açıkça null gönderiyor (eval/chat_regression.py
    # ile yakalandı, 2026-09-23) - `int` iken doğrulama hatası aracı çökertiyordu.
    set_count: int | None = Field(
        default=1,
        description=(
            "Bu TAM reps/weight_kg kombinasyonuyla kaç AYRI set yapıldığı. "
            "SADECE kullanıcı '4x12 50kg' ya da '3 set 10 tekrar 60 kilo' gibi "
            "AYNI ağırlık/tekrarın birden çok kez tekrarlandığını belirtirse "
            "kullan — o durumda listeye aynı elemanı N kez KOPYALAYARAK YAZMAK "
            "YERİNE tek bir elemanla ve set_count=N belirt.\n\n"
            "KRİTİK UYARI — set_count 'toplam kaç set yapıldığı' ile "
            "KARIŞTIRILMAMALI: kullanıcı 'squat 4 set sırasıyla 100kg 10 tekrar, "
            "110kg 8 tekrar, 120kg 6 tekrar, 130kg 2 tekrar' derse bu 4 FARKLI "
            "reps/ağırlık kombinasyonudur — her biri set_count=1 (varsayılan) "
            "ile AYRI bir eleman olmalı. YANLIŞ: bu 4 elemanın HER BİRİNE "
            "set_count=4 verip listeyi 16 elemana çıkarmak (mesajdaki '4 set' "
            "sayısını görüp otomatik olarak her elemanı o sayıyla çarpmak) — bu "
            "ciddi bir veri hatası, ağırlık hacmini yanlış şişirir. set_count'u "
            "SADECE tek bir elemanın kendisi N kez AYNEN tekrarlanıyorsa "
            "kullan, farklı reps/ağırlıklı elemanlarda HER ZAMAN 1 (varsayılan) "
            "bırak.\n\n"
            "AYRI KRİTİK UYARI — 'Nx10 sırasıyla A, B, C' kalıbı (çarpım "
            "öneki + 'sırasıyla' + virgüllü FARKLI değer listesi): kullanıcı "
            "'arka omuz için 3x10 sırasıyla 55kg, 60kg ve 65kg yaptım' derse "
            "'sırasıyla'dan sonra TAM OLARAK N (=3) adet FARKLI ağırlık "
            "sayılıyor — bu 3 FARKLI settir, 'Nx' önekindeki N'i set_count "
            "SANMA. DOĞRU: 3 AYRI eleman yaz (her biri reps=10, ağırlıkları "
            "sırasıyla 55/60/65), HER birinde set_count=1 (varsayılan). "
            "YANLIŞ: bu 3 elemanın HER BİRİNE set_count=3 verip listeyi 9 "
            "sete çıkarmak (aynı '4 set sırasıyla farklı ağırlık' hatasının "
            "'Nx' önekiyle yazılmış hâli — matematik aynı: N farklı eleman × "
            "yanlışlıkla set_count=N). set_count SADECE 'sırasıyla' YOKKEN ya "
            "da 'sırasıyla'dan sonra TEK bir değer varken kullanılır (ör. "
            "'peck deck 3x10 65kg' → TEK ağırlık, set_count=3 DOĞRU).\n\n"
            "AYRI KRİTİK UYARI — AYNI cümlede bir egzersiz için İKİ AYRI GRUP "
            "art arda gelebilir (önce tekrarlı bir grup, sonra tek başına "
            "farklı bir set): 'ön omuz için 12kg ile 3x10, sonrasında 15kg "
            "ile 8 tekrar attım' — bu İKİ AYRI grup anlatıyor: (1) 12kg'de "
            "10 tekrarlık bir grup ki 3 KEZ tekrarlanmış (set_count=3), (2) "
            "15kg'de 8 tekrarlık TEK bir set (set_count=1). DOĞRU: İKİ eleman "
            "yaz — {reps:10, weight_kg:12, set_count:3} VE {reps:8, "
            "weight_kg:15, set_count:1} — TOPLAM 4 set. YANLIŞ: ikinci grubu "
            "atlamak ya da ilk grubun set_count'unu unutup 1 yazmak (bu "
            "sessizce set kaybeder, en sık görülen hata: '3x10' kısmı "
            "cümlenin ortasında kalınca gözden kaçıp tek sete düşüyor)."
        ),
    )


# "3x10", "4 set", "3 drop set" - mesajdaki set çarpanı ifadeleri.
_SET_MULTIPLIER_RE = re.compile(r"\b\d+\s*[x×]\s*\d+|\b\d+\s*(?:drop\s*|süper\s*)?set\b")


def _undo_multiplied_set_counts(items: list[ExerciseSetItem], user_message: str) -> bool:
    """2026-09-28 eval (kullanıcının push mesajı, 5 denemede 1): "3 set; 70kg 10,
    75kg 8, 80kg 6" için model 3 elemanın HER BİRİNE set_count=3 verdi, 9 set
    yazıldı - set_count açıklamasındaki uyarıya rağmen. Bir hareketin en az N
    farklı elemanının hepsi set_count=N ise bu çarpım hatasıdır; ancak kullanıcı
    elemana özgü çarpan yazmış olabilir ("3x10 50kg, 3x10 55kg, 3x10 60kg" = 9
    set): mesajdaki çarpan ifadesi hareket sayısını aşıyorsa dokunulmaz.
    Düzeltme yapıldıysa True."""
    groups: dict[str, list[ExerciseSetItem]] = {}
    for item in items:
        groups.setdefault(tr_lower((item.exercise_name or "").strip()), []).append(item)
    if len(_SET_MULTIPLIER_RE.findall(tr_lower(user_message))) > len(groups):
        return False
    fixed = False
    for group in groups.values():
        counts = {item.set_count or 1 for item in group}
        distinct = {(item.reps, item.weight_kg, item.duration_minutes) for item in group}
        # len >= n: canlı testte "3 set pushdown; 55, 60, 65 + 20kg drop" 4 elemanın
        # hepsine set_count=3 verildi (12 set).
        if len(counts) == 1 and (n := counts.pop()) > 1 and len(group) >= n and len(distinct) == len(group):
            for item in group:
                item.set_count = 1
            fixed = True
    return fixed


# "12,5kg 30 tekrar", "70 kilo 10 tekrar" - mesajda yazılmış (kg, tekrar) çiftleri.
_KG_REPS_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\s*(?:ile\s*)?(\d+)\s*tekrar")
# Aynı listenin iki çifti arasında yalnız ayraç olabilir (başka hareketin adı değil).
_PAIR_GAP_RE = re.compile(r"^[\s,;+/&-]*(?:ve|sonra)?[\s,;+/&-]*$")


def _expand_collapsed_drop_sets(items: list[ExerciseSetItem], user_message: str) -> list[ExerciseSetItem]:
    """2026-09-28 eval (kullanıcının push mesajı, 10 denemede 2): "3 drop set lateral
    raise; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18 tekrar" -> model tek eleman
    {reps:30, weight_kg:12.5, set_count:3} yazdı, 10 ve 7,5 kg'lık setler kayboldu.
    Elemanın (kg, tekrar) çifti mesajda bitişik bir listenin başındaysa ve listenin
    sonraki set_count-1 çifti bu çağrıda başka hiçbir elemanda yoksa, eleman o
    çiftlere açılır. Gerçek "aynı değerle N set" ("3 set 70kg 10 tekrar") listenin
    devamı olmadığı ya da devamı başka harekete ait olduğu için etkilenmez."""
    text = tr_lower(user_message)
    runs: list[list[tuple[float, int]]] = []
    previous_end = None
    for match in _KG_REPS_RE.finditer(text):
        pair = (float(match.group(1).replace(",", ".")), int(match.group(2)))
        if previous_end is not None and _PAIR_GAP_RE.match(text[previous_end : match.start()]):
            runs[-1].append(pair)
        else:
            runs.append([pair])
        previous_end = match.end()
    logged = {(item.weight_kg, item.reps) for item in items}
    expanded: list[ExerciseSetItem] = []
    for item in items:
        count = item.set_count or 1
        replacement = None
        if count > 1 and item.weight_kg is not None and item.reps is not None:
            for run in runs:
                if (item.weight_kg, item.reps) not in run:
                    continue
                start = run.index((item.weight_kg, item.reps))
                following = run[start + 1 : start + count]
                if len(following) == count - 1 and len(set(following)) == count - 1 and not (set(following) & logged):
                    replacement = [(item.weight_kg, item.reps), *following]
                break
        if replacement is None:
            expanded.append(item)
            continue
        for weight, reps in replacement:
            expanded.append(item.model_copy(update={"weight_kg": weight, "reps": reps, "set_count": 1}))
    return expanded


# "20 dakika", "1 saat", "45dk", "yarım saat" - mesajda süreli bir aktivite var mı.
_DURATION_MENTION_RE = re.compile(r"(\d+([.,]\d+)?\s*(dakika|dk|dak|saat)\b|yarım saat)")


@dataclass
class WorkoutTurnSummary:
    """Bu turda kaydedilen (ad -> set sayısı) ve bugün zaten kayıtlı olduğu için
    atlanan hareketler. Orkestratör yanıt bunları anmıyorsa sona ekler (bkz.
    orchestrator._append_workout_summary): 2026-09-28 canlı testte koç yanlış
    eşleşen hareketleri de, tekrar diye atlananları da hiç söylemedi."""

    logged: dict[str, int] = field(default_factory=dict)
    skipped: list[str] = field(default_factory=list)


def build_workout_tracking_tools(
    db: Session,
    user_id: int,
    expected_days_ago: int | None = None,
    user_message: str = "",
    turn_summary: WorkoutTurnSummary | None = None,
) -> list[BaseTool]:
    summary = turn_summary if turn_summary is not None else WorkoutTurnSummary()
    # Kullanıcının katalog görüntüleme dili (bkz. UserProfile.preferred_
    # language) — bu turda BİR KEZ okunup closure'da tutulur, egzersiz
    # kayıt/hedef araçlarının hepsi kanonik ismi (TR/EN) buna göre seçer.
    # Sohbetin GERİ KALANI (LLM'in ürettiği metin) bundan ETKİLENMEZ, sadece
    # katalogdan gelen kanonik isim seçimi (ayrı bir faz, bkz.
    # project_health_coach_status.md).
    _language = profile_service.get_language(db, user_id)

    # Bu turdaki (TEK bir run_orchestrator çağrısı — bu fonksiyon her chat
    # isteğinde yeniden çağrılıp yeni bir closure kurduğu için sonraki
    # mesajlara SIZMAZ) egzersiz başına loglanan (reps, weight_kg) listesini
    # tutar. Canlı testte yakalandı (2026-08-05): çok sayıda egzersiz içeren
    # uzun bir mesajda model bazen AYNI egzersizin AYNI setlerini birkaç
    # saniye/on saniye arayla İKİNCİ KEZ log'luyordu (muhtemelen uzun
    # tool-call zincirinde kendi önceki çıktısını "unutup" tekrar üretmesi).
    # Burada bir egzersiz için gelen set listesi, o egzersiz için bu turda
    # daha önce kaydedilenle BİREBİR aynıysa (aynı sırada aynı reps/ağırlık)
    # sessizce atlanır — modelin prompt talimatına güvenmek yerine
    # deterministik bir güvenlik ağı. Farklı egzersizler ya da GERÇEKTEN
    # farklı set değerleri (ör. ek bir egzersiz unutulup sonradan eklendi)
    # bundan etkilenmez, sadece BİREBİR tekrar engellenir.
    #
    # nutrition_tracking_agent.py'de BİREBİR aynı mantık ayrıca yazılmıştı
    # (2026-08-10 mimari borç raporu, bulgu #4) - artık ortak TurnDedupGuard.
    _dedup_guard: TurnDedupGuard[tuple[int | None, float | None, float | None]] = TurnDedupGuard()
    # Guard'ı SADECE bu turla değil, BUGÜN DB'de zaten kayıtlı setlerle de
    # "seed" et - aksi halde konuşma geçmişinde duran önceki bir mesaj,
    # sonraki bir turda modelin TÜM eski antrenmanı ikinci kez loglamasına
    # yol açabiliyordu (canlı testte bulundu, 2026-08-31; bkz.
    # workout_service.list_today_sets_by_exercise docstring'i).
    for _key, _items in workout_service.list_today_sets_by_exercise(db, user_id).items():
        _dedup_guard.seed(_key, _items)

    # İSİMDEN BAĞIMSIZ, ikinci bir güvenlik ağı - canlı testte bulundu
    # (2026-08-31): model bazen TEK bir turda log_exercise_sets_bulk'u İKİ
    # KEZ çağırıp ikinci seferde egzersiz isimlerini HALÜSİNASYONLA FARKLI
    # üretiyordu (sayısal değerler birebir aynıyken isim farklı olduğu için
    # yukarıdaki isim-bazlı _dedup_guard bunu yakalayamıyordu - bkz.
    # workout_service.list_today_session_fingerprints docstring'i). Bugün
    # zaten var olan her oturumun "parmak izi" (sıralanmış reps/ağırlık/süre
    # çoklu-kümesi) burada seed ediliyor, her yeni bulk çağrının TAMAMI bu
    # kümeyle karşılaştırılıyor.
    _seen_fingerprints = workout_service.list_today_session_fingerprints(db, user_id)

    # Guard'lar BUGÜNÜN kayıtlarıyla seed ediliyor - geçmiş güne (days_ago)
    # yazılan setin anahtarına tarih eklenir, yoksa "dün de aynısını yaptım"
    # bugünkü kaydın tekrarı sanılıp atlanırdı.
    _today = user_today(db, user_id)

    def _dedup_name(name: str, day: date) -> str:
        return name if day == _today else f"{name}@{day.isoformat()}"

    # 2026-09-28 canlı test (uzun geçmişli hesap): "bench 4x8 ..., en son 20 dakika
    # koşu bandı" - yalnızca kuvvet setleri kaydedildi, koç yine de "koşu bandını da
    # ekledim" dedi (plank + mekik'te de aynısı). Mesajda süre geçiyor ve bu turda
    # henüz süreli set kaydedilmediyse kayıt yanıtı modeli uyarır.
    _duration_expected = bool(_DURATION_MENTION_RE.search(tr_lower(user_message)))
    _duration_logged = [False]

    def _missing_duration_note() -> str:
        if not _duration_expected or _duration_logged[0]:
            return ""
        return (
            " UYARI: Kullanıcının mesajında süreli bir aktivite (dakika/saat) var ama bu turda "
            "henüz süreli set kaydedilmedi. Kaydetmediysen şimdi duration_minutes (+intensity, "
            "cardio_category) ile kaydet; kaydedilmeyen bir şey için 'kaydettim/ekledim' deme."
        )

    def _weekly_goal_note() -> str:
        """Kayıt sonrası koça haftalık hedef durumu (hedef yoksa boş) - "hedefinin
        3/4'ündesin" diyebilsin diye (2026-09-23, haftalık hedef özelliği)."""
        progress = weekly_goal_service.get_weekly_goal_progress(db, user_id)
        return f" {progress.as_text()}" if progress.goal_days is not None else ""

    @tool
    def search_exercise_catalog(query: str) -> str:
        """Egzersiz kataloğunda isimle arama yapar, en yakın eşleşen adayları
        Türkçe isimleriyle listeler. Arama hem Türkçe hem İngilizce isim
        üzerinden çalışır (ör. kullanıcı "dumbbell shoulder press" de yazsa
        "dambıl omuz presi" de yazsa aynı egzersiz bulunur). Kullanıcının
        söylediği egzersiz adı kataloğa net eşleşmiyorsa (log_exercise_set
        belirsiz adaylar döndürdüğünde) veya kullanıcı doğrudan bir egzersiz
        aramak istediğinde bu aracı çağır."""
        results = exercise_catalog_service.search_exercises(db, query)
        if not results:
            return "Katalogda bu aramaya uyan bir egzersiz bulunamadı."
        return "Bulunan egzersizler: " + ", ".join(row.name_tr for row in results)

    @tool
    def log_exercise_set(
        exercise_name: str | None = None,
        reps: int | None = None,
        weight_kg: float | None = None,
        workout_type: str | None = None,
        duration_minutes: float | None = None,
        intensity: str | None = None,
        cardio_category: str | None = None,
        set_count: int | None = 1,
        sets: list[ExerciseSetItem] | int | None = None,
        days_ago: int | None = None,
    ) -> str:
        """Kullanıcının yaptığı BİR seti (egzersiz adı, tekrar sayısı, opsiyonel
        ağırlık) YA DA süre bazlı TEK bir kardiyo/esneklik aktivitesini
        kaydeder. Kullanıcı AYNI mesajda birden fazla set/egzersiz/aktivite
        belirtirse (ör. '3x10 squat 60 kilo yaptım' gibi TEK egzersizin
        birden fazla seti, ya da birden fazla egzersiz) bu aracı tekrar tekrar
        ÇAĞIRMA — bunun yerine log_exercise_sets_bulk'u tüm setlerle TEK
        seferde çağır. Bu araç SADECE kullanıcının TEK bir set/aktivite
        anlattığı durumlar içindir. Aynı gün içindeki setler otomatik olarak
        aynı antrenman oturumuna eklenir, set numarası kendiliğinden artar.
        Bu genel bilgi sorularında kullanılan search_exercise_knowledge ile
        KARIŞTIRMA — bu araç somut bir antrenman KAYDI içindir. workout_type
        belirtilmişse (kuvvet/kardiyo/esneklik/karışık) ilet. exercise_name
        için: ExerciseSetItem.exercise_name'deki 'hareket türünü bağlamdan
        çıkarıp ekle' kuralı burada da geçerli.

        SÜRE BAZLI aktivite (ör. 'bugün 25 dakika koştum', '30 dk yürüdüm') —
        reps VE weight_kg'yi BOŞ bırak, bunun yerine duration_minutes
        [+intensity+cardio_category] doldur (bkz. ExerciseSetItem.
        duration_minutes/intensity/cardio_category ile AYNI kural - ikisi de
        duration_minutes doluyken ZORUNLU). Canlı testte bulundu
        (2026-08-31): bu alanlar eklenmeden önce sohbet ajanı süre bazlı bir
        aktiviteyi HİÇBİR ŞEKİLDE kaydedemiyordu, sessizce atlayıp yine de
        başarı iddia edebiliyordu.

        set_count: AYNI tekrar/ağırlıkla kaç set yapıldığı (ör. '3 set 10
        tekrar 60 kg' → set_count=3). Varsayılan 1. `sets` doldurulursa
        log_exercise_sets_bulk ile aynı işi yapar.

        days_ago: set/aktivite GEÇMİŞ bir güne aitse (dün=1, evvelsi gün=2,
        en fazla 7); bugün için boş bırak."""
        # 2026-09-26 eval: modelin en sık hatası bu araca toplu aracın `sets`
        # argümanını göndermekti (65 denemede ~4 kez; bir kez iki deneme üst üste,
        # hiçbir şey kaydedilmedi). İsim zorunluyken şema hatası veriyordu, isteğe
        # bağlıyken sessizce yok sayılıyordu - artık toplu araca iletiliyor.
        # 2026-09-28 eval (900 kg squat): model `sets: 1` (sayı) gönderdi, şema hatası
        # kaydı düşürdü - sayı set sayısı demektir.
        if isinstance(sets, int):
            set_count, sets = max(sets, set_count or 1), None
        if sets:
            return log_exercise_sets_bulk.invoke(
                {"sets": [item.model_dump() for item in sets], "workout_type": workout_type, "days_ago": days_ago}
            )
        exercise_name = _resolve_exercise_name(exercise_name, cardio_category)
        if exercise_name is None:
            return _MISSING_EXERCISE_NAME
        if duration_minutes is not None and intensity is None:
            intensity = DEFAULT_INTENSITY  # orkestratör "Kaydedilmedi"yi başarısız sayar
        # 2026-09-23 canlı testte bulundu (gerçek model çağrıları izlenerek):
        # "3 set, 10 tekrar, 62.5 kg" mesajlarının bir kısmında model bu aracı
        # (bulk yerine) `set_count=3` ile çağırıyordu - parametre burada
        # tanımlı olmadığı için LangChain onu SESSİZCE atıyor, 1 set
        # kaydediliyor, model yine de "3 seti kaydettim" diyordu. Çoklu set
        # isteği bulk araca devrediliyor - aynı set_count açma ve tekrar
        # kontrolü mantığı birebir yeniden kullanılır.
        if set_count is not None and set_count > 1:
            return log_exercise_sets_bulk.invoke(
                {
                    "sets": [
                        {
                            "exercise_name": exercise_name,
                            "reps": reps,
                            "weight_kg": weight_kg,
                            "duration_minutes": duration_minutes,
                            "intensity": intensity,
                            "cardio_category": cardio_category,
                            "set_count": min(set_count, MAX_SET_COUNT),
                        }
                    ],
                    "workout_type": workout_type,
                    "days_ago": days_ago,
                }
            )

        log_date = resolve_log_date(db, user_id, days_ago, expected_days_ago)
        if isinstance(log_date, str):
            return log_date

        match = exercise_catalog_service.match_for_set(db, exercise_name, cardio_category)
        catalog_id = match.id if match is not None else None

        # Kardiyo için soru sorulmaz: katalogda açık hava koşusu/yüzme gibi
        # kayıtlar yok, adaylar alakasız çıkar (bkz. match_for_set).
        if catalog_id is None and not cardio_category:
            candidates = exercise_catalog_service.search_exercises(db, exercise_name, limit=3)
            if candidates:
                names = ", ".join(candidate.name_tr for candidate in candidates)
                return (
                    f"'{exercise_name}' katalogda net olarak bulunamadı. Kullanıcıya şunlardan "
                    f"birini mi kastettiğini sor: {names}. Netleşince tekrar çağır."
                )
            # Katalogda hiç yakın eşleşme yok; yine de kullanıcının verdiği isimle kaydet.

        # Eşleşme varsa DB'DEKİ kanonik isimle kaydet, LLM'in ürettiği/çevirdiği
        # ham metinle DEĞİL — aksi halde aynı egzersiz farklı ifadelerle
        # (ör. "lat pulldown" vs kataloğun "Geniş Tutuş Aşağı Lat Çekiş"i)
        # farklı isimlerde birikip grafik/istatistiklerde ayrı, anormal
        # kalemler olarak görünüyordu (canlı testte bulundu, 2026-08-07).
        canonical_name = exercise_catalog_service.canonical_name(
            match if catalog_id is not None else None, exercise_name, _language
        )

        # Dedup kontrolü KANONİK isimle yapılıyor, HAM `exercise_name`
        # DEĞİL - guard'ın "bugün DB'de zaten var" seed'i DB'deki kanonik
        # snapshot isimlerinden okunuyor (bkz. log_exercise_sets_bulk'taki
        # aynı gerekçe, canlı testte bulundu 2026-08-31); ham metin ancak
        # canonical_name çözümlendikten SONRA karşılaştırılırsa turlar arası
        # tutarlı çalışır.
        # 2026-09-23: TEK bir set için "birebir tekrar" kontrolü YAPILMIYOR -
        # tek elemanlı bir listede tekrar ile meşru yeni set ayırt edilemiyor.
        # Önceden salonda set set yazan kullanıcının ("squat 10 tekrar 60 kg"
        # x3 mesaj) 2. ve 3. setleri "zaten kaydettin" diye atlanıyor, model
        # de başarı iddia ediyordu (sessiz veri kaybı). Set yine de guard'a
        # işleniyor ki sonraki bir BULK çağrısının tekrar kontrolü onu görsün.
        _dedup_guard.seed(_dedup_name(canonical_name, log_date), [(reps, weight_kg, duration_minutes)])

        try:
            workout_set = workout_service.log_single_set(
                db,
                user_id,
                exercise_name=canonical_name,
                reps=reps,
                weight_kg=weight_kg,
                exercise_catalog_id=catalog_id,
                session_date=log_date,
                workout_type=workout_type,
                duration_minutes=duration_minutes,
                intensity=intensity,
                cardio_category=cardio_category,
            )
        except ValueError as exc:
            # "Kaydedilmedi" öneki: orkestratör bunu başarısız sayar. Düz hata
            # metni başarılı sayılıyor, model "kaydettim" deyince sahte kayıt
            # koruması devreye girmiyordu (2026-09-27 canlı test: yoğunluksuz kardiyo).
            return f"Kaydedilmedi: {exc}"

        name = workout_set.exercise_name_snapshot
        summary.logged[name] = summary.logged.get(name, 0) + 1
        if workout_set.duration_minutes is not None:
            _duration_logged[0] = True
            calorie_note = (
                f", ~{workout_set.estimated_calories:.0f} kalori" if workout_set.estimated_calories else ""
            )
            return (
                f"Kaydedildi: {workout_set.exercise_name_snapshot}, {workout_set.duration_minutes:.0f} "
                f"dakika{calorie_note}."
            ) + past_date_note(log_date, _today) + _weekly_goal_note()

        saved = (
            f"Kaydedildi: {workout_set.exercise_name_snapshot}, set {workout_set.set_number}, "
            f"{workout_set.reps} tekrar"
            + (f", {workout_set.weight_kg} kg" if workout_set.weight_kg else "")
            + "."
        ) + past_date_note(log_date, _today)
        suspicious = workout_service.implausible_weight_note(db, user_id, workout_set)
        if suspicious:
            # Not EN BAŞTA ve haftalık hedef notu YOK: uzun geçmişli hesapta not
            # sonda kalınca model 6 denemenin 4'ünde teyit sorarken "tebrikler"
            # de diyordu (2026-09-26).
            return f"{suspicious} {saved}" + _missing_duration_note()
        if workout_set.is_personal_record:
            record_note = (
                " Bu, kullanıcının bu egzersizdeki YENİ KİŞİSEL REKORU: "
                + workout_service.describe_record(db, user_id, workout_set)
                + ". Yanıtında bunu rekorun türüne sadık kalarak, coşkuyla ama abartısız kutla."
            )
        else:
            record_note = ""
        return saved + record_note + _weekly_goal_note() + _missing_duration_note()

    @tool
    def log_exercise_sets_bulk(
        sets: list[ExerciseSetItem], workout_type: str | None = None, days_ago: int | None = None
    ) -> str:
        """Kullanıcının TEK mesajda anlattığı BİRDEN FAZLA seti (2 veya daha
        fazla, aynı egzersizden ya da farklı egzersizlerden) TEK seferde
        kaydeder. Kullanıcı bir antrenmanın tamamını ya da birden çok seti
        tek mesajda anlatıyorsa (ör. 'shoulder press 70kg 8, 75kg 7, sonra
        lateral raise 12kg 4 set 10 tekrar...') log_exercise_set'i HER set
        için tek tek çağırmak YERİNE bu aracı TERCİH ET: tüm setleri TEK bir
        listeyle, TEK çağrıda ilet — bu, çok sayıda ayrı çağrıya göre çok
        daha güvenilir çalışır. Kullanıcı sadece TEK bir set anlatıyorsa
        (ör. '60 kilo 10 tekrar squat yaptım') log_exercise_set'i kullan.

        KRİTİK — AYNI ağırlık/tekrarın birden çok kez tekrarlandığı durumlar
        (ör. '3 set 10 tekrar 60 kilo bench press', '4x12 50kg ile kalf
        yaptım') için `set_count` alanını kullan: TEK bir eleman yaz, o
        elemanın set_count'unu tekrar sayısına eşitle. Örnek: '3 set 10
        tekrar 60kg bench press' →
        sets=[{"exercise_name":"bench press","reps":10,"weight_kg":60,"set_count":3}].
        '4x12 50kg ile kalf yaptım' →
        sets=[{"exercise_name":"kalf makinesi","reps":12,"weight_kg":50,"set_count":4}].
        AYNI elemanı elle N kez kopyalayıp listeye ekleme — bu daha
        hataya açık, set_count kullan. Farklı setlerde tekrar/ağırlık
        değişiyorsa (ör. '8x70kg, 7x75kg') her biri zaten doğal olarak ayrı
        bir eleman, hepsinde set_count=1 (varsayılan) kalır.

        KRİTİK — 'Nx10 sırasıyla A, B, C' kalıbı set_count'la KARIŞTIRILMAZ:
        '3x10 sırasıyla 55kg, 60kg, 65kg' 3 FARKLI settir (N=3 değer
        sayılıyor), 'Nx' önekindeki 3'ü set_count sanma. DOĞRU: sets=[
        {"exercise_name":"...","reps":10,"weight_kg":55},
        {"exercise_name":"...","reps":10,"weight_kg":60},
        {"exercise_name":"...","reps":10,"weight_kg":65}] (üçünde de
        set_count=1, varsayılan). YANLIŞ: üç elemanın da set_count=3
        yapılıp 9 sete çıkarılması. 'sırasıyla'dan sonra TEK değer varsa
        (ör. 'peck deck 3x10 65kg') bu farklı bir durum, orada set_count=3
        DOĞRU kullanımdır (yukarıdaki '4x12 50kg' örneğiyle aynı kalıp).

        KRİTİK — 'Nx[tekrar] A, B, C ile drop yaptım' kalıbı (drop set):
        yukarıdaki 'sırasıyla' kuralıyla KARIŞTIRILMAZ, farklı bir anlamı
        var. 'lateral için 4x20 12kg, 10kg ve 7kg ile drop yaptım' burada
        kullanıcı TOPLAM 4 set yapmıştır (her seti aynı 3 ağırlık arasında
        ağırlık düşürerek/drop tekniğiyle tamamlamıştır) — 4x3=12 set OLARAK
        YORUMLAMA (bu ciddi bir aşırı sayım hatası). DOĞRU: TEK eleman,
        set_count='Nx' önekindeki N (burada 4), weight_kg=listedeki İLK/EN
        AĞIR değer (drop set en ağırdan başlar): sets=[{"exercise_name":
        "lateral raise","reps":20,"weight_kg":12,"set_count":4}]. (Şemanın
        tek ağırlık alanı tam drop-set detayını — setin ortasında ağırlığın
        düşmesini — kaydedemiyor, bu bilinen bir sınırlama; en ağır/başlangıç
        ağırlığı temsilci değer olarak kullanılıyor.) Ayırt edici işaret:
        'sırasıyla' YOK, bunun yerine 'drop' kelimesi VAR.

        AMA her ağırlığın KENDİ tekrar sayısı yazılmışsa bu kural GEÇERSİZ:
        '3 drop set lateral raise; 12,5kg 30 tekrar, 10kg 24 tekrar, 7,5kg 18
        tekrar' 3 AYRI settir - her (ağırlık, tekrar) çifti ayrı eleman,
        set_count=1: sets=[{..."reps":30,"weight_kg":12.5}, {..."reps":24,
        "weight_kg":10}, {..."reps":18,"weight_kg":7.5}]. YANLIŞ (2026-09-28
        eval): tek eleman {reps:30, weight_kg:12.5, set_count:3} - 10 ve 7,5
        kg'lık setler kaybolur. Bir setin sonuna eklenen drop ('65kg 10
        tekrar + 20kg 20 tekrar') da ayrı bir eleman olarak yazılır.

        AYRI KRİTİK UYARI (drop-set'e özel undercounting hatası): set_count
        HER ZAMAN 'Nx' önekindeki N'DİR — listelenen ağırlık SAYISI DEĞİL.
        Yukarıdaki örnekte 3 ağırlık (12kg,10kg,7kg) sayılıyor ama set_count
        YİNE DE 4 olmalı ('4x20' önekinden). YANLIŞ: ağırlık sayısını (3)
        görüp 3 AYRI eleman yazmak (her biri set_count=1 varsayılanla) — bu,
        'Nx' önekindeki gerçek toplam seti (4) sessizce 3'e düşürür, bir set
        tamamen kaybolur. Ağırlık listesinin uzunluğu ile 'Nx' önekindeki N
        FARKLI sayılar olabilir (drop-set'te her zaman N > ağırlık sayısı
        beklenir) — ikisini karıştırma, set_count her zaman N'i taşımalı.

        Bu aracı bir egzersiz için TEK bir turda BİR KEZ çağır — aynı
        egzersizi ikinci kez (aynı ya da başka bir çağrıda) tekrar loglama;
        zaten kaydedilmiş bir egzersiz otomatik olarak atlanır ama yine de
        gereksiz bir çağrı olur.

        Setler aynı antrenman oturumuna eklenir, egzersiz başına set numarası
        kendiliğinden artar. Egzersiz katalogda net eşleşmese bile kullanıcının
        verdiği isimle kaydedilir (tek tek onay beklemek burada veri
        kaybından daha kötü bir sonuç olur).

        days_ago: setler GEÇMİŞ bir güne aitse (dün=1, evvelsi gün=2, en
        fazla 7); bugün için boş bırak."""
        log_date = resolve_log_date(db, user_id, days_ago, expected_days_ago)
        if isinstance(log_date, str):
            return log_date
        # Her elemanı set_count kadar birim sete AÇ (ör. set_count=4 → 4 ayrı
        # (exercise_name, reps, weight_kg) birimi) — model artık aynı seti N
        # kez elle kopyalamak zorunda değil, sadece bir sayı yazıyor. Canlı
        # testte (2026-08-05) tam bu "aynı değeri N kez kopyala" adımında
        # model bazen tek elemana sıkışıp set kaybediyordu (bkz.
        # feedback_llm_tuning_health_coach.md); set_count bu riski ortadan
        # kaldırıyor çünkü tekrar eden JSON metni üretmeyi gerektirmiyor.
        expanded: list[ExerciseSetItem] = []
        for item in sets:
            item.exercise_name = _resolve_exercise_name(item.exercise_name, item.cardio_category)
        if any(item.exercise_name is None for item in sets):
            return _MISSING_EXERCISE_NAME
        if _undo_multiplied_set_counts(sets, user_message):
            logger.warning("set_count çarpım hatası düzeltildi (user_id=%s)", user_id)
        before = len(sets)
        sets = _expand_collapsed_drop_sets(sets, user_message)
        if len(sets) != before:
            logger.warning("Sıkıştırılmış drop set mesajdan açıldı (user_id=%s)", user_id)
        for item in sets:
            if item.duration_minutes is not None and item.intensity is None:
                item.intensity = DEFAULT_INTENSITY
            count = min(max(1, item.set_count or 1), MAX_SET_COUNT)
            expanded.extend(
                ExerciseSetItem(
                    exercise_name=item.exercise_name,
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    duration_minutes=item.duration_minutes,
                    intensity=item.intensity,
                    cardio_category=item.cardio_category,
                )
                for _ in range(count)
            )
        sets = expanded

        # İsimden BAĞIMSIZ tekrar kontrolü (bkz. yukarıdaki _seen_fingerprints
        # yorumu) - bu çağrının TÜM setlerinin sayısal içeriği bugün zaten
        # var olan bir oturumla birebir aynıysa, isimler ne olursa olsun
        # TAMAMEN atla. Egzersiz isim çözümlemesinden ÖNCE yapılıyor ki
        # yanlış/halüsinasyonlu isimler hiç DB'ye yazılmasın.
        # key=str - bkz. workout_service.list_today_session_fingerprints'teki
        # aynı gerekçe (None ile int/float karşılaştırması TypeError verir).
        call_fingerprint: tuple = tuple(
            sorted(((item.reps, item.weight_kg, item.duration_minutes) for item in sets), key=str)
        )
        if call_fingerprint and log_date != _today:
            call_fingerprint = (log_date.isoformat(), *call_fingerprint)
        if call_fingerprint and call_fingerprint in _seen_fingerprints:
            return (
                "Bu setlerin TAMAMI (aynı tekrar/ağırlık/süre kombinasyonuyla) zaten "
                "kaydedilmiş görünüyor, tekrar kaydetmedim - muhtemelen aynı antrenmanı "
                "farklı bir ifadeyle ikinci kez anlatıyorsun."
            )
        if call_fingerprint:
            # Bu turda AYNI çağrının üçüncü kez tekrarlanmasına karşı da
            # (nadir ama olabilir) hemen kaydediliyor - başarılı DB
            # commit'ini beklemeye gerek yok, TurnDedupGuard.is_exact_repeat
            # ile AYNI ilke (ilk görüldüğünde işaretle).
            _seen_fingerprints.add(call_fingerprint)

        # Kanonik ismi (varsa katalog eşleşmesi) HER eleman için önceden
        # çözümle - dedup gruplaması buna göre yapılacak, HAM LLM metnine
        # göre DEĞİL (bkz. aşağıdaki not). Eşleşme varsa DB'deki kanonik
        # isimle kaydet (bkz. log_exercise_set'teki aynı gerekçe) — LLM'in
        # yazdığı isim SADECE eşleşme yoksa kullanılır.
        resolved_items: list[tuple[str, int | None]] = []  # (canonical_name, catalog_id)
        for item in sets:
            raw_name = item.exercise_name or ""  # yukarıda boş isim reddedildi
            match = exercise_catalog_service.match_for_set(db, raw_name, item.cardio_category)
            catalog_id = match.id if match is not None else None
            canonical_name = exercise_catalog_service.canonical_name(
                match if catalog_id is not None else None, raw_name, _language
            )
            resolved_items.append((canonical_name, catalog_id))

        # KANONİK isme göre grupla (bkz. _dedup_guard) — her egzersizin bu
        # çağrıdaki TÜM setleri, o egzersiz için DAHA ÖNCE (bu turda VEYA
        # bugün DB'de) kaydedilenle birebir aynıysa TAMAMI atlanır (uzun
        # mesajlarda modelin aynı egzersizi ikinci kez loglaması engellenir).
        # HAM LLM metni (item.exercise_name) DEĞİL kanonik isim kullanılıyor
        # çünkü guard'ın "bugün DB'de zaten var" seed'i (bkz. yukarısı)
        # DB'deki kanonik snapshot isimlerinden okunuyor - LLM aynı egzersizi
        # farklı bir ham ifadeyle yazarsa (ör. "shoulder press" / "omuz
        # presi") ham metin bazlı gruplama bu iki turu hiç eşleştiremezdi
        # (canlı testte bulundu, 2026-08-31). Aynı çağrı İÇİNDEKİ meşru
        # tekrarlar (set_count veya elle kopyalanan özdeş elemanlar) bundan
        # etkilenmez, sadece SONRAKİ bir tekrar çağrı engellenir.
        order: list[str] = []
        indices_by_key: dict[str, list[int]] = {}
        for idx, (canonical_name, _catalog_id) in enumerate(resolved_items):
            key = tr_lower(canonical_name.strip())
            indices_by_key.setdefault(key, []).append(idx)
            if key not in order:
                order.append(key)

        skip_indices: set[int] = set()
        skipped_exercises: list[str] = []
        for key in order:
            idxs = indices_by_key[key]
            items_tuples = [(sets[i].reps, sets[i].weight_kg, sets[i].duration_minutes) for i in idxs]
            canonical_name_for_group = resolved_items[idxs[0]][0]
            if _dedup_guard.is_exact_repeat(_dedup_name(canonical_name_for_group, log_date), items_tuples):
                skip_indices.update(idxs)
                skipped_exercises.append(canonical_name_for_group)

        resolved_sets = []
        for idx, item in enumerate(sets):
            if idx in skip_indices:
                continue
            canonical_name, catalog_id = resolved_items[idx]
            resolved_sets.append(
                workout_service.SetInput(
                    exercise_name=canonical_name,
                    reps=item.reps,
                    weight_kg=item.weight_kg,
                    exercise_catalog_id=catalog_id,
                    duration_minutes=item.duration_minutes,
                    intensity=item.intensity,
                    cardio_category=item.cardio_category,
                )
            )

        summary.skipped.extend(name for name in skipped_exercises if name not in summary.skipped)
        if not resolved_sets:
            return (
                "Bu egzersiz(ler)i ("
                + ", ".join(skipped_exercises)
                + ") zaten kaydettim, tekrar kaydetmedim."
            )

        try:
            session = workout_service.log_workout_session(
                db, user_id, sets=resolved_sets, session_date=log_date, workout_type=workout_type
            )
        except ValueError as exc:
            return f"Kaydedilmedi: {exc}"  # bkz. log_exercise_set

        per_exercise: dict[str, int] = {}
        new_records: list[str] = []
        suspicious_notes: dict[str, str] = {}  # egzersiz başına tek not
        for workout_set in session.sets:
            per_exercise[workout_set.exercise_name_snapshot] = (
                per_exercise.get(workout_set.exercise_name_snapshot, 0) + 1
            )
            suspicious = workout_service.implausible_weight_note(db, user_id, workout_set)
            if suspicious:
                suspicious_notes.setdefault(workout_set.exercise_name_snapshot, suspicious)
                continue
            if workout_set.is_personal_record:
                detail = f"{workout_set.reps} tekrar" + (
                    f", {workout_set.weight_kg} kg" if workout_set.weight_kg else ""
                )
                kind = workout_service.describe_record(db, user_id, workout_set)
                new_records.append(f"{workout_set.exercise_name_snapshot} ({detail}; {kind})")
        for name, count in per_exercise.items():
            summary.logged[name] = summary.logged.get(name, 0) + count
        if any(s.duration_minutes is not None for s in session.sets):
            _duration_logged[0] = True
        breakdown =", ".join(f"{name}: {count} set" for name, count in per_exercise.items())
        result = f"{len(session.sets)} set kaydedildi ({breakdown})." + past_date_note(log_date, _today)
        # 2026-09-28 canlı test: "skullcrusher" bantlı varyanta kaydedildi, koç yalnız
        # "tüm hareketlerini kaydettim" dedi - kullanıcı hatayı uygulamada fark etti.
        # Adlar yanıtta görünürse yanlış eşleşme sohbette yakalanır.
        if len(per_exercise) > 1:
            result += " Yanıtında kaydedilen hareketleri bu adlarla kısaca say (kullanıcı eşleşmeyi görsün)."
        unmatched = sorted(
            {name for i, (name, catalog_id) in enumerate(resolved_items) if catalog_id is None and i not in skip_indices}
        )
        if unmatched:
            result += (
                " Katalogda karşılığı bulunamayıp kullanıcının yazdığı adla kaydedilenler: "
                + ", ".join(unmatched)
                + "."
            )
        if skipped_exercises:
            result += (
                " (" + ", ".join(skipped_exercises) + " zaten kaydedilmişti, "
                "tekrar kaydedilmedi.)"
            )
        if new_records:
            result += (
                " YENİ KİŞİSEL REKOR(LAR): " + "; ".join(new_records)
                + ". Yanıtında bunları rekorun türüne sadık kalarak, coşkuyla ama abartısız kutla."
            )
        if suspicious_notes:
            # Tek set aracındaki gibi: not başta, haftalık hedef notu yok.
            return " ".join(suspicious_notes.values()) + " " + result + _missing_duration_note()
        return result + _weekly_goal_note() + _missing_duration_note()

    @tool
    def get_workout_summary(days: int = 7) -> str:
        """Kullanıcının son `days` gündeki (varsayılan 7) detaylı antrenman
        özetini (set sayısı, hacim, en çok çalışılan egzersizler) döndürür.
        Kullanıcı 'bu hafta hangi egzersizleri yaptım' gibi bir şey sorduğunda
        bu aracı çağır. Haftalık antrenman günü hedefinin durumunu da içerir."""
        # days LLM'den geliyor - sınırsız bir değer tarih aritmetiğinde taşıyordu.
        days = min(max(days, 1), 365)
        summary = workout_service.generate_workout_summary(db, user_id, days=days).as_text()
        return f"{summary} {weekly_goal_service.get_weekly_goal_progress(db, user_id).as_text()}"

    @tool
    def set_exercise_goal(
        exercise_name: str,
        target_weight_kg: float | None = None,
        target_reps: int | None = None,
        target_duration_minutes: float | None = None,
    ) -> str:
        """Kullanıcının bir egzersizde ulaşmak istediği hedefi kaydeder. İki tür:
        (1) ağırlık hedefi, isteğe bağlı tekrar alt-hedefiyle ('squat'ta 100
        kiloya ulaşmak istiyorum' → target_weight_kg=100; 'bench'te 80 kiloda 5
        tekrar' → target_weight_kg=80, target_reps=5 - kullanıcı tekrar söylediyse
        target_reps'i MUTLAKA ver), (2) süre hedefi kardiyo/esneklik için ('koşu
        bandında 30 dakika' → target_duration_minutes=30, ağırlık/tekrar boş).
        Aynı egzersiz için tekrar çağrılırsa hedefi günceller. Antrenman
        geçmişindeki en iyi kayıtla otomatik karşılaştırılıp ilerleme izlenir."""
        match, score = exercise_catalog_service.best_match(db, exercise_name)
        catalog_id = (
            match.id if match is not None and score >= exercise_catalog_service.FUZZY_MATCH_THRESHOLD else None
        )
        # Eşleşme varsa DB'deki kanonik isimle kaydet (bkz. log_exercise_set'teki
        # aynı gerekçe) — aksi halde aynı egzersiz için hedef ve gerçek antrenman
        # kaydı farklı isimlerde birikip ilerleme karşılaştırması bozulabilir.
        canonical_name = exercise_catalog_service.canonical_name(
            match if catalog_id is not None else None, exercise_name, _language
        )
        try:
            goal = exercise_goal_service.set_exercise_goal(
                db,
                user_id,
                exercise_name=canonical_name,
                target_weight_kg=target_weight_kg,
                exercise_catalog_id=catalog_id,
                # Parametreler LLM'den geliyor: tekrar tam sayıya yuvarlanır, sınırları servis denetler.
                target_reps=round(target_reps) if target_reps is not None else None,
                target_duration_minutes=target_duration_minutes,
            )
        except ValueError as exc:
            # "Kaydedilmedi" öneki: orkestratör başarısız sayar (sahte "kaydettim" koruması).
            return f"Kaydedilmedi: {exc}"
        # 2026-09-28 canlı test: araç yalnızca ağırlık alıyordu, "80 kiloda 5 tekrar"
        # hedefinin tekrarı düşüyor, model yine de "5 tekrar olarak kaydettim" diyordu.
        if goal.target_duration_minutes is not None:
            return f"Hedef kaydedildi: {goal.exercise_name} — {goal.target_duration_minutes:.0f} dakika."
        reps_part = f" × {goal.target_reps} tekrar" if goal.target_reps is not None else " (tekrar hedefi yok)"
        return f"Hedef kaydedildi: {goal.exercise_name} — {goal.target_weight_kg} kg{reps_part}."

    @tool
    def get_exercise_goals() -> str:
        """Kullanıcının tüm egzersiz ağırlık hedeflerini ve mevcut
        ilerlemesini (antrenman geçmişindeki en iyi kayıtla karşılaştırmalı)
        döndürür. Kullanıcı 'hedeflerime ne kadar yaklaştım' gibi bir şey
        sorduğunda bu aracı çağır."""
        progress = exercise_goal_service.list_exercise_goal_progress(db, user_id)
        if not progress:
            return "Kullanıcının henüz kayıtlı bir egzersiz hedefi yok."
        parts = []
        for item in progress:
            # 2026-08-27: bu araç şu an SADECE ağırlık hedefi OLUŞTURABİLİYOR
            # (set_exercise_goal'ın imzası hâlâ target_weight_kg-only, bkz.
            # yukarısı), ama LİSTELEME mobil/web'de girilmiş süre (kardiyo) ya
            # da tekrar alt-hedefli kayıtları da döndürebilir - buradaki metin
            # üretimi o durumlarda da doğru olmalı (aksi halde "hedef None kg"
            # gibi anlamsız bir cümle LLM'e bağlam olarak gidiyordu).
            if item.target_duration_minutes is not None:
                best = f"{item.best_duration_minutes:.0f} dk" if item.best_duration_minutes is not None else "henüz kayıt yok"
                parts.append(
                    f"{item.exercise_name}: hedef {item.target_duration_minutes:.0f} dk, en iyi {best} (%{item.progress_pct:.0f})"
                )
                continue
            best = f"{item.best_weight_kg} kg" if item.best_weight_kg is not None else "henüz kayıt yok"
            rep_suffix = f", {item.target_reps} tekrar" if item.target_reps is not None else ""
            parts.append(
                f"{item.exercise_name}: hedef {item.target_weight_kg} kg{rep_suffix}, en iyi {best} (%{item.progress_pct:.0f})"
            )
        return "; ".join(parts)

    return [
        search_exercise_catalog,
        log_exercise_set,
        log_exercise_sets_bulk,
        get_workout_summary,
        set_exercise_goal,
        get_exercise_goals,
    ]
