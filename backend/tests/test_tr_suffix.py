"""Yüzdeye gelen ek sayının okunuşuna uyar (canlı test 2026-10-13: "%16'i")."""

import pytest

from app.services.tr_suffix import percent_possessive, possessive_suffix


@pytest.mark.parametrize(
    ("number", "suffix"),
    [
        (0, "ı"),  # sıfırı
        (1, "i"),  # biri
        (2, "si"),  # ikisi
        (3, "ü"),  # üçü
        (4, "ü"),  # dördü
        (5, "i"),  # beşi
        (6, "sı"),  # altısı
        (7, "si"),  # yedisi
        (8, "i"),  # sekizi
        (9, "u"),  # dokuzu
        (10, "u"),  # onu
        (16, "sı"),  # on altısı
        (20, "si"),  # yirmisi
        (30, "u"),  # otuzu
        (40, "ı"),  # kırkı
        (50, "si"),  # ellisi
        (59, "u"),  # elli dokuzu
        (60, "ı"),  # altmışı
        (70, "i"),  # yetmişi
        (80, "i"),  # sekseni
        (90, "ı"),  # doksanı
        (100, "ü"),  # yüzü
        (128, "i"),  # yüz yirmi sekizi
        (200, "ü"),  # iki yüzü
        (1000, "i"),  # bini
    ],
)
def test_possessive_suffix_follows_the_spoken_number(number, suffix):
    assert possessive_suffix(number) == suffix


def test_percent_possessive_rounds_before_picking_the_suffix():
    assert percent_possessive(16.4) == "%16'sı"
    assert percent_possessive(58.6) == "%59'u"
    assert percent_possessive(28) == "%28'i"
