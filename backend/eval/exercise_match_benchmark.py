"""Egzersiz adı -> katalog eşleştirme ölçümü (2026-09-29).

Sohbette modelin log aracına verdiği gerçekçi adlar (TR/EN karışık, yazım
hatalı, salon argosu) için kabul edilen katalog kayıtları elle işaretlendi.
`None` kabul listesindeyse "katalogda karşılığı yok, kullanıcının adıyla kaydet"
de doğru sayılır.

Sonuç sınıfları:
- doğru: kabul listesinde
- YANLIŞ: kabul listesinde olmayan bir harekete bağlandı (sessiz yanlış veri - en kötüsü)
- kaçırıldı: kayıt beklenirken katalogsuz kaldı (ad korunur, yalnız katalog bağı yok)

Sonuç (2026-09-29, gemma4:e4b, services/exercise_resolver.py son hali;
doğru / YANLIŞ / kaçırıldı):
    set         eski          yeni
    KOLAY       40 / 0 / 0    40 / 0 / 0
    ZOR         23 / 15 / 2   32 / 6 / 2
    KONTROL     26 / 21 / 3   41 / 7 / 2
    KONTROL-2   34 / 9 / 7    45 / 4 / 1
    KONTROL-3   39 / 4 / 7    43 / 4 / 3
KONTROL ve KONTROL-2 ilk çalıştırıldıklarında tarafsızdı (eski -> yeni YANLIŞ:
22 -> 8, 9 -> 9); sonra hatalarına bakılarak kural eklendi. KONTROL-3'e kural
eklenmedi, ama TRUSTED_LEXICAL_SCORE eşiği onun katman dağılımı görülerek
seçildi. Model gereken grupta (4 ad) çözüm ~1.2-2 sn, gerekmeyende 0.

Kullanım (backend/ içinden, `ollama serve` açıkken):
    python -m eval.exercise_match_benchmark            # eski + yeni
    python -m eval.exercise_match_benchmark --only-old # model çağırmadan
Geliştirme DB'sinin kataloğunu yalnız OKUR.
"""

import argparse
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# (ifade, kabul edilen katalog id'leri; None = katalogsuz kayıt da doğru)
EASY: list[tuple[str, set[int | None]]] = [
    ("bench press", {73}),
    ("incline bench press", {53}),
    ("dumbbell chest press", {222}),
    ("smith machine incline chest press", {706}),
    ("peck deck", {878}),
    ("makinede shoulder press", {459}),
    ("dumbell lateral raise", {877}),
    ("skullcrusher", {254}),
    ("pushdown", {825}),
    ("lat pulldown", {858}),
    ("t bar row", {812}),
    ("tek kol dambıl row", {483}),
    ("face pull", {267}),
    ("ez bar curl", {253}),
    ("hammer curl", {309}),
    ("squat", {880}),
    ("leg press", {412}),
    ("romanian deadlift", {604}),
    ("barfiks", {560}),
    ("şınav", {568}),
    ("plank", {539}),
    ("mekik", {687}),
    ("deadlift", {881}),
    ("hip thrust", {52}),
    ("bulgarian split squat", {883}),
    ("leg extension", {410}),
    ("leg curl", {448, 644, 768}),
    ("calf raise", {752}),
    ("shoulder press", {882}),
    ("dips", {209, 532}),
    ("chin up", {160}),
    ("front squat", {295}),
    ("incline dumbbell fly", {342}),
    ("reverse curl", {585, 587, 756}),
    ("reverse fly", {589}),
    ("seated cable row", {626}),
    ("cable crossover", {111}),
    ("military press", {772}),
    ("goblet squat", {302}),
    ("hack squat", {308}),
]

HARD: list[tuple[str, set[int | None]]] = [
    ("baldır makinesi", {628, 752, 135, 136}),
    ("halatla triceps", {826, 824}),
    ("yan omuz kablo", {888, 130}),
    ("diamond push up", {562}),
    ("dambıl rdl", {604, 791}),
    ("sırt makinesi", {None, 419, 417, 331}),
    ("row machine", {419, 417, 611}),
    ("incline curl", {341, 12}),
    ("single leg rdl", {None, 604}),
    ("lat pulldown machine", {858, 298}),
    ("kalça makinesi", {None, 52, 815, 301}),
    ("makine kürek", {419, 417, 626}),
    ("v up", {None, 365}),
    ("reverse hyper", {593}),
    ("stair climber", {740, 789}),
    ("chest fly machine", {878, 109}),
    ("hip thrust machine", {52}),
    ("sumo squat", {None, 543}),
    ("landmine press", {None, 402}),
    ("cable pullover", {None, 795, 609}),
    ("nordic curl", {475, 275}),
    ("bird dog", {None}),
    ("hollow hold", {None}),
    ("toes to bar", {None, 319}),
    ("woodchopper", {751}),
    ("pike push up", {None}),
    ("bisiklet mekik", {None, 8}),
    ("ön kol", {None, 528, 529, 530, 531, 633, 634, 650, 651, 133}),
    ("single arm cable row", {648, 656}),
    ("oturarak dambıl omuz presi", {635, 244}),
    ("arka omuz makine", {879, 594}),
    ("göğüs makinesi", {456, 414, 878}),
    ("omuz makinesi", {459, 420}),
    ("karın makinesi", {3}),
    ("ters mekik", {588, 125, 204}),
    ("yan mekik", {478, 479}),
    ("pendulum squat", {None, 308}),
    ("belt squat", {None}),
    ("cable fly low to high", {428, 111}),
    ("wrist curl", {528, 529, 530, 531, 633, 634, 650, 651, 133}),
]

# Kontrol seti: çözümleyicinin kuralları/eş-adları KOLAY+ZOR'a bakarak ayarlandı;
# bu set o ayarlamada hiç kullanılmadı ve çalıştırılmadan önce etiketlendi
# (aşırı uyum ölçüsü). Buna göre kural ekleme - yeni bir kontrol seti yaz.
HELDOUT: list[tuple[str, set[int | None]]] = [
    ("halter squat", {64, 880}),
    ("dambıl squat", {247}),
    ("makinede biceps curl", {457}),
    ("makinede triceps", {460, 208}),
    ("oturarak baldır", {628}),
    ("ayakta baldır", {752}),
    ("halatla overhead triceps", {824, 126}),
    ("eğimli dambıl row", {228}),
    ("chest supported dumbbell row", {228}),
    ("arnold pres", {26}),
    ("dambıl front raise", {874}),
    ("kablo front raise", {288}),
    ("ters tutuş barfiks", {160}),
    ("hamstring curl makinesi", {448, 644, 768}),
    ("iç bacak", {816}),
    ("dış bacak", {815}),
    ("trap bar", {821}),
    ("kettlebell deadlift", {None}),
    ("dambıl step up", {249}),
    ("farmer's carry", {268}),
    ("sled push", {693}),
    ("battle rope", {68}),
    ("jump squat", {282, 850}),
    ("pistol squat", {None, 379}),
    ("wall ball", {None}),
    ("glute ham raise", {300, 475}),
    ("hiperekstansiyon makinesi", {331}),
    ("floor press", {276}),
    ("zercher squat", {871}),
    ("barbell good morning", {303, 792}),
    ("dambıl preacher curl", {509, 830}),
    ("makine preacher", {458}),
    ("tek kol preacher", {509}),
    ("kablo hammer curl", {114}),
    ("halatla hammer curl", {114}),
    ("ip crunch", {607, 782}),
    ("kablo crunch", {112}),
    ("ez bar skull crusher", {254}),
    ("dambıl kickback", {822}),
    ("triceps dips makinesi", {208}),
    ("incline smith", {706}),
    ("decline smith", {703, 205}),  # katalogda iki kayıt: "Decline Smith Press" da aynı hareket
    ("smith shoulder press", {709}),
    ("smith row", {700}),
    ("smith squat", {712}),
    ("dambıl shrug", {245}),
    ("kablo shrug", {132}),
    ("yüzüstü leg curl", {448}),
    ("seated row makinesi", {626, 419}),
    ("dambıl pullover", {78, 794}),
]

# İkinci kontrol seti: KONTROL'deki hatalara bakılarak kural eklendiği için (sıralama
# katmanları, anlam değiştiren niteleyiciler, birkaç eş-ad) o set artık tarafsız
# değil; bu set ondan SONRA, çalıştırılmadan etiketlendi.
HELDOUT2: list[tuple[str, set[int | None]]] = [
    ("nötr tutuş dambıl bench", {223}),
    ("tek kol dambıl bench", {508}),
    ("dar tutuş dambıl pres", {172}),
    ("çapraz hammer curl", {183}),
    ("alternatif hammer curl", {10}),
    ("dambıl upright row", {759}),
    ("kablo upright row", {839}),
    ("geri lunge dambıl", {240}),
    ("barbell lunge", {55}),
    ("yürüyerek lunge", {67, 96}),
    ("dambıl split squat", {733}),
    ("barbell step up", {66}),
    ("tek kol kablo curl", {774}),
    ("baş üstü kablo curl", {520}),
    ("oturarak konsantrasyon curl", {181, 630}),
    ("ayakta konsantrasyon curl", {753}),
    ("zottman preacher", {873}),
    ("ters kürek", {356, 357}),
    ("muscle up", {471, 387}),
    ("ağırlıklı bench dip", {848}),
    ("dip makinesi", {208}),
    ("dar tutuş ez bar press", {174}),
    ("yatarak triceps press", {455}),
    ("kablo yatarak triceps extension", {121}),
    ("düz kol dambıl pullover", {794}),
    ("barbell pullover", {77, 857}),
    ("oturarak barbell military press", {620}),
    ("kablo omuz presi", {131, 627}),
    ("barbell shoulder press", {59, 620, 772}),
    ("tek kol kettlebell swing", {498}),
    ("kettlebell arnold", {372}),
    ("oturarak kettlebell press", {380}),
    ("barbell glute bridge", {49}),
    ("tek bacak glute bridge", {685}),
    ("dar duruş leg press", {473}),
    ("barbell hack squat", {51}),
    ("oturarak good morning", {640}),
    ("bantlı skull crusher", {41}),
    ("smith leg press", {707}),
    ("bacak pres makinesinde baldır", {136}),
    ("eğilerek iki dambıl row", {85}),
    ("uzun bar row", {84, 83, 812}),
    ("yüksek kablo curl", {323}),
    ("yatarak kablo curl", {436}),
    ("ters tutuş row", {591}),
    ("tek kol dambıl omuz presi", {235}),
    ("dambıl yer presi", {226}),
    ("ab crunch makinesi", {3}),
    ("sissy squat", {852}),
    ("kablo lateral raise ayakta", {888}),
]

# Üçüncü kontrol seti - SON ölçüm: KONTROL-2'deki hatalara bakılarak da kural
# değiştirildi (kelime eşleşmesini model adıyla teyit, birkaç eş anlam); bu set
# ondan sonra etiketlendi ve sonucuna göre kural EKLENMEDİ.
HELDOUT3: list[tuple[str, set[int | None]]] = [
    ("incline dambıl bench nötr tutuş", {340}),
    ("barbell rear delt row", {56}),
    ("kablo halat rear delt row", {127}),
    ("tek kol kettlebell row", {494}),
    ("renegade row", {20}),
    ("iki kol kettlebell row", {834}),
    ("bodyweight row", {94, 356}),
    ("barbell walking lunge", {67}),
    ("vücut ağırlığıyla walking lunge", {96}),
    ("smith split squat", {715}),
    ("dambıl calf raise", {137, 754}),
    ("ayakta barbell calf raise", {742}),
    ("oturarak barbell calf raise", {58}),
    ("eşek calf raise", {211}),
    ("dambıl yan eğilme", {246}),
    ("barbell side bend", {62}),
    ("ağırlıklı mekik", {849}),
    ("decline mekik", {197}),
    ("tuck crunch", {829}),
    ("egzersiz topu mekik", {261}),
    ("kettlebell floor press", {489, 263}),
    ("dar tutuş barbell curl", {178}),
    ("dar tutuş ez bar curl", {175}),
    ("drag curl", {219}),
    ("makinede preacher curl", {458}),
    ("kablo preacher curl", {123}),
    ("iki kol dambıl preacher", {830}),
    ("tek kol dambıl triceps extension", {236}),
    ("decline dambıl triceps extension", {200}),
    ("eğimli barbell triceps extension", {336}),
    ("alçak kablo triceps extension", {429}),
    ("halka dips", {600}),
    ("ters tutuş bent over row", {591}),
    ("smith bent over row", {700}),
    ("smith upright row", {714}),
    ("tek kol dambıl upright row", {237}),
    ("smith arkadan shrug", {698}),
    ("barbell arkadan shrug", {61}),
    ("makine shrug", {421}),
    ("bantlı sumo deadlift", {800}),
    ("zincirli sumo deadlift", {801}),
    ("smith stiff leg deadlift", {713}),
    ("dambıl stiff leg deadlift", {791}),
    ("push press", {565}),
    ("kettlebell push press", {214, 493}),
    ("yüzüstü t-bar row", {454}),
    ("kızak itme", {693}),
    ("savaş ipi", {68}),
    ("dambıl clean", {225}),
    ("clean and press", {168}),
]

BATCH = 4  # bir mesajdaki belirsiz hareket sayısına yakın


def _classify(row, accept: set[int | None]) -> str:
    row_id = row.id if row is not None else None
    if row_id in accept:
        return "doğru"
    return "kaçırıldı" if row_id is None else "YANLIŞ"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only-old", action="store_true")
    args = parser.parse_args()

    from app.db.session import SessionLocal
    from app.services import exercise_catalog_service, exercise_resolver

    db = SessionLocal()
    try:
        sets = (("KOLAY", EASY), ("ZOR", HARD), ("KONTROL", HELDOUT), ("KONTROL-2", HELDOUT2), ("KONTROL-3", HELDOUT3))
        for label, cases in sets:
            counts_old: dict[str, int] = {}
            counts_new: dict[str, int] = {}
            lines = []
            new_rows: dict[str, object] = {}
            timings: list[float] = []
            movements: dict[str, str | None] = {}  # modelin standart İngilizce adı
            if not args.only_old:

                def recording_namer(names: list[str]) -> list[str | None] | None:
                    result = exercise_resolver.llm_namer(names)
                    for phrase, movement in zip(names, result or [None] * len(names)):
                        movements[phrase] = movement
                    return result

                resolver = exercise_resolver.ExerciseResolver(db, namer=recording_namer, enabled=True)
                for start in range(0, len(cases), BATCH):
                    batch = [(phrase, None) for phrase, _ in cases[start : start + BATCH]]
                    t = time.perf_counter()
                    resolver.prefetch(batch)
                    timings.append(time.perf_counter() - t)
                new_rows = {phrase: resolver.match(phrase, None) for phrase, _ in cases}
            for phrase, accept in cases:
                old = exercise_catalog_service.match_for_set(db, phrase, None)
                old_class = _classify(old, accept)
                counts_old[old_class] = counts_old.get(old_class, 0) + 1
                line = f"  {phrase:32} eski: {old_class:9} {old.name_tr if old else '-'}"
                if not args.only_old:
                    new = new_rows[phrase]
                    new_class = _classify(new, accept)
                    counts_new[new_class] = counts_new.get(new_class, 0) + 1
                    line += f"  | yeni: {new_class:9} {getattr(new, 'name_tr', '-')}"
                    if phrase in movements:
                        line += f"  [model: {movements[phrase]}]"
                lines.append(line)
            print(f"\n== {label} ({len(cases)} ifade)")
            print("\n".join(lines))
            print(f"  eski: {counts_old}")
            if not args.only_old:
                print(f"  yeni: {counts_new}")
                print(f"  toplu çözüm süresi (grup başına {BATCH}): " + ", ".join(f"{s:.1f}s" for s in timings))
    finally:
        db.close()


if __name__ == "__main__":
    main()
