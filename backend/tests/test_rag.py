import pytest

from app.rag.retriever import retrieve


@pytest.mark.integration
def test_retrieve_nutrition_returns_relevant_chunk():
    result = retrieve("nutrition", "günlük kalori ihtiyacımı nasıl hesaplarım")
    assert "Kaynak:" in result
    assert "makro_kalori_hesaplama.md" in result


@pytest.mark.integration
def test_retrieve_exercise_returns_relevant_chunk():
    result = retrieve("exercise", "squat yaparken dizlerime dikkat etmem gereken şey nedir")
    assert "Kaynak:" in result
    assert "form_ve_teknik_temelleri.md" in result
