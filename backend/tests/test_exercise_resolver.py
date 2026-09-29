"""Belirsiz egzersiz adında modelin adlandırmasıyla katalog çözümü (2026-09-29).

Gerçek model yerine sahte adlandırıcı, gerçek gömme yerine sahte vektör kaynağı
verilir; ölçümün kendisi eval/exercise_match_benchmark.py'de (gerçek modelle)."""

from types import SimpleNamespace

import numpy as np
import pytest
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.exercise_catalog import ExerciseCatalog
from app.services import exercise_catalog_service
from app.services.catalog_vectors import CatalogVectors
from app.services.exercise_resolver import (
    ExerciseResolver,
    _movement_tokens,
    build_naming_prompt,
    movement_rank,
    parse_names,
)
from tests.db_utils import make_test_engine


def _row(name_en: str, name_tr: str | None = None, category: str = "kuvvet") -> ExerciseCatalog:
    return ExerciseCatalog(
        source_id=name_en.replace(" ", "_"),
        name_en=name_en,
        name_tr=name_tr or name_en,
        category_tr=category,
        equipment_tr="-",
        primary_muscles_tr="-",
        level_tr="orta",
    )


CATALOG = [
    ("Calf-Machine Shoulder Shrug", "Baldır Makinesi Omuz Silkme", "kuvvet"),
    ("Seated Calf Raise", "Oturarak Baldır Kaldırma", "kuvvet"),
    ("Smith Machine Calf Raise", "Smith Makinesi Baldır Kaldırma", "kuvvet"),
    ("Triceps Stretch", "Triceps Germe", "esneklik"),
    ("Triceps Pushdown", "Triceps Aşağı İtme", "kuvvet"),
    ("Triceps Pushdown - Rope Attachment", "Halat Bağlantılı Triceps Aşağı İtme", "kuvvet"),
    ("Cross Body Hammer Curl", "Çapraz Biceps Kıvırma (Hammer Curl)", "kuvvet"),
    ("Hammer Curls", "Çekiç Curl (Hammer Curls)", "kuvvet"),
    ("Squat", "Squat (Çömelme)", "kuvvet"),
    ("Running", "Koşu", "kardiyo"),
]


class _NoVectors:
    def nearest(self, rows, query, k):  # noqa: ARG002 - CatalogVectors arayüzü
        return []


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    session.add_all(_row(en, tr, cat) for en, tr, cat in CATALOG)
    session.commit()
    exercise_catalog_service.invalidate_cache()
    try:
        yield session
    finally:
        session.close()
        exercise_catalog_service.invalidate_cache()


class _Namer:
    def __init__(self, names: dict[str, str | None] | None, fail: bool = False) -> None:
        self.names = names or {}
        self.fail = fail
        self.calls: list[list[str]] = []

    def __call__(self, phrases: list[str]) -> list[str | None] | None:
        self.calls.append(phrases)
        if self.fail:
            return None
        return [self.names.get(p) for p in phrases]


def _resolver(db, namer) -> ExerciseResolver:
    return ExerciseResolver(db, namer=namer, vectors=_NoVectors(), enabled=True)  # type: ignore[arg-type]  # sahte vektör


# ---- ayrıştırma / kelimeler ----


def test_parse_names_accepts_complete_json():
    assert parse_names('{"1": "Seated Calf Raise", "2": null}', 2) == ["Seated Calf Raise", None]
    assert parse_names('önce {"1": {"hareket": "Bird Dog"}} sonra', 1) == ["Bird Dog"]


@pytest.mark.parametrize("text", ['{"1": "A"}', "yanıt yok", '["A", "B"]', '{"1": "A", "2": '])
def test_parse_names_rejects_incomplete_or_invalid(text):
    assert parse_names(text, 2) is None


def test_naming_prompt_lists_phrases_without_candidates():
    prompt = build_naming_prompt(["halatla triceps", "baldır makinesi"])
    assert '1) "halatla triceps"' in prompt and '2) "baldır makinesi"' in prompt


@pytest.mark.parametrize(
    ("text", "tokens"),
    [
        ("Push-Ups", {"pushup"}),
        ("Incline Dumbbell Flyes", {"incline", "dumbbell", "fly"}),
        ("Crunches", {"crunch"}),
        ("Dumbbell Lunges", {"dumbbell", "lunge"}),
        ("One-Arm Leverage Row", {"single", "arm", "machine", "row"}),
        ("Hyperextensions (Back Extensions)", {"hyperextension", "back", "extension"}),
    ],
)
def test_movement_tokens(text, tokens):
    assert _movement_tokens(text) == tokens


# ---- tutarlılık kuralı ----


@pytest.mark.parametrize(
    ("movement", "name_en", "consistent"),
    [
        ("Triceps Rope Pushdown", "Triceps Pushdown - Rope Attachment", True),
        ("Reverse Curl", "Reverse Cable Curl", True),  # kullanıcı ekipman söylemedi
        ("Calf Machine Raise", "Smith Machine Calf Raise", False),  # söylemediği farklı ekipman
        ("Calf Machine Raise", "Seated Calf Raise", True),  # katalog adında "machine" yok
        ("Hyperextension", "Reverse Hyperextension", False),  # anlam değiştiren niteleyici
        ("Kettlebell Deadlift", "Kettlebell One-Legged Deadlift", False),
        ("Dumbbell Romanian Deadlift", "Romanian Deadlift", True),  # iki kelimelik genel sürüm
        ("Pendulum Squat", "Squat", False),  # tek kelimelik genel kayıt
        ("Bird Dog", "London Bridges", False),
        ("Row Machine", "Sled Row", False),  # yalnız genel hareket kelimesi kalıyor
        ("Adductor Machine", "Thigh Adductor", True),
    ],
)
def test_movement_rank_consistency(movement, name_en, consistent):
    assert (movement_rank(movement, _row(name_en)) is not None) is consistent


def test_movement_rank_rejects_stretch_unless_asked():
    stretch = _row("Triceps Stretch", category="esneklik")
    assert movement_rank("Triceps", stretch) is None
    assert movement_rank("Triceps Stretch", stretch) is not None


def test_movement_rank_prefers_superset_over_generic_subset():
    specific = movement_rank("Cable Hammer Curl", _row("Cable Hammer Curls - Rope Attachment"))
    generic = movement_rank("Cable Hammer Curl", _row("Hammer Curls"))
    assert specific is not None and generic is not None and specific < generic


# ---- çözümleyici ----


def test_certain_and_full_word_matches_skip_the_model(db_session):
    namer = _Namer({})
    resolver = _resolver(db_session, namer)
    resolver.prefetch([("squat", None), ("triceps pushdown", None), ("pushdown triceps", None)])
    assert namer.calls == []
    squat = resolver.match("squat", None)
    assert squat is not None and squat.name_en == "Squat"


def test_one_word_short_match_is_replaced_by_model_named_movement(db_session):
    # Kelime tabanlı: "baldır makinesi" -> "Baldır Makinesi Omuz Silkme" (önek, kesin değil).
    namer = _Namer({"baldır makinesi": "Calf Machine Raise", "halatla triceps": "Triceps Rope Pushdown"})
    resolver = _resolver(db_session, namer)
    resolver.prefetch([("baldır makinesi", None), ("halatla triceps", None)])

    assert len(namer.calls) == 1  # iki belirsiz ad tek çağrıda
    calf = resolver.match("baldır makinesi", None)
    rope = resolver.match("halatla triceps", None)
    assert calf is not None and calf.name_en == "Seated Calf Raise"
    assert rope is not None and rope.name_en == "Triceps Pushdown - Rope Attachment"


def test_lexical_match_kept_when_consistent_with_model_name(db_session):
    # Model niteleyiciyi düşürse de ("çapraz" -> yalnız "Hammer Curl") kullanıcının
    # kelimeleriyle bulunan ve adın bütün kelimelerini içeren kayıt korunur.
    resolver = _resolver(db_session, _Namer({"çapraz hammer curl": "Hammer Curl"}))
    match = resolver.match("çapraz hammer curl", None)
    assert match is not None and match.name_en == "Cross Body Hammer Curl"


def test_no_consistent_candidate_means_no_catalog_link(db_session):
    resolver = _resolver(db_session, _Namer({"bird dog": "Bird Dog"}))
    assert resolver.match("bird dog", None) is None


def test_model_says_unknown(db_session):
    resolver = _resolver(db_session, _Namer({"asdf qwer": None}))
    assert resolver.match("asdf qwer", None) is None


def test_model_failure_falls_back_to_lexical_match(db_session):
    resolver = _resolver(db_session, _Namer(None, fail=True))
    match = resolver.match("baldır makinesi", None)
    assert match is not None and match.name_en == "Calf-Machine Shoulder Shrug"  # eski davranış


def test_disabled_resolver_uses_lexical_match_only(db_session):
    namer = _Namer({})
    resolver = ExerciseResolver(db_session, namer=namer, vectors=_NoVectors(), enabled=False)  # type: ignore[arg-type]  # sahte vektör
    assert resolver.match("baldır makinesi", None) is not None
    assert namer.calls == []


def test_moving_cardio_only_links_to_cardio_rows(db_session):
    resolver = _resolver(db_session, _Namer({"tempolu koşu": "Running"}))
    run = resolver.match("tempolu koşu", "kosu")
    assert run is not None and run.category_tr == "kardiyo"


def test_results_are_cached_within_turn(db_session):
    namer = _Namer({"baldır makinesi": "Calf Machine Raise"})
    resolver = _resolver(db_session, namer)
    resolver.match("baldır makinesi", None)
    resolver.match("baldır makinesi", None)
    assert len(namer.calls) == 1


# ---- gömme vektörleri ----


def _fake_embed(calls: list[int]):
    vocabulary = ["calf", "triceps", "rope", "squat", "run"]

    def embed(texts: list[str]) -> list[list[float]]:
        calls.append(len(texts))
        return [[1.0 if word in text.lower() else 0.0 for word in vocabulary] + [0.01] for text in texts]

    return embed


def test_catalog_vectors_nearest_and_disk_cache(tmp_path):
    rows = [SimpleNamespace(id=i, name_en=en, name_tr=tr) for i, (en, tr, _cat) in enumerate(CATALOG, start=1)]
    calls: list[int] = []
    vectors = CatalogVectors("exercise", tmp_path, embed=_fake_embed(calls))
    nearest = vectors.nearest(rows, "rope triceps", 2)
    assert nearest[0] == 6  # "Triceps Pushdown - Rope Attachment"
    assert sum(calls) == len(rows) + 1  # katalog (parçalı) + sorgu
    assert len(list(tmp_path.glob("exercise_*.npy"))) == 1

    # Yeni süreç: katalog yeniden gömülmez, dosyadan okunur.
    calls_again: list[int] = []
    again = CatalogVectors("exercise", tmp_path, embed=_fake_embed(calls_again))
    assert again.nearest(rows, "squat", 1) == [9]
    assert calls_again == [1]


def test_catalog_vectors_failure_returns_empty_and_backs_off(tmp_path):
    rows = [SimpleNamespace(id=1, name_en="Squat", name_tr="Squat")]
    attempts: list[int] = []

    def broken(texts: list[str]) -> list[list[float]]:
        attempts.append(len(texts))
        raise ConnectionError("ollama yok")

    vectors = CatalogVectors("exercise", tmp_path, embed=broken)
    assert vectors.nearest(rows, "squat", 3) == []
    assert vectors.nearest(rows, "squat", 3) == []
    assert len(attempts) == 1  # bekleme süresince yeniden denenmez


def test_catalog_vectors_normalizes(tmp_path):
    rows = [SimpleNamespace(id=1, name_en="Squat", name_tr="Squat")]
    vectors = CatalogVectors("exercise", tmp_path, embed=lambda texts: [[3.0, 4.0] for _ in texts])
    vectors.nearest(rows, "squat", 1)
    matrix = np.load(next(tmp_path.glob("exercise_*.npy")))
    assert np.allclose(np.linalg.norm(matrix, axis=1), 1.0)
