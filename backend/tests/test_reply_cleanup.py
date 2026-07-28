import pytest
from langchain_core.messages import AIMessage

from app.agents.orchestrator import MAX_REPLY_SENTENCES, _cap_sentence_count, _clean_truncated_reply


def _msg(content: str, done_reason: str = "stop") -> AIMessage:
    return AIMessage(content=content, response_metadata={"done_reason": done_reason})


def test_cap_sentence_count_leaves_short_reply_untouched():
    content = "Bir. İki. Üç."
    assert _cap_sentence_count(content, MAX_REPLY_SENTENCES) == content


def test_cap_sentence_count_leaves_reply_at_exact_limit_untouched():
    content = " ".join(f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES + 1))
    assert _cap_sentence_count(content, MAX_REPLY_SENTENCES) == content


def test_cap_sentence_count_trims_reply_over_limit():
    sentences = [f"Cümle {i}." for i in range(1, 9)]
    content = " ".join(sentences)
    result = _cap_sentence_count(content, MAX_REPLY_SENTENCES)
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES])
    assert result.count(".") == MAX_REPLY_SENTENCES


def test_cap_sentence_count_ignores_content_without_sentence_boundaries():
    content = "noktalama yok bu metinde"
    assert _cap_sentence_count(content, MAX_REPLY_SENTENCES) == content


def test_clean_truncated_reply_leaves_short_stop_reply_untouched():
    content = "Bugün harika gidiyorsun. Böyle devam et."
    assert _clean_truncated_reply(_msg(content, "stop")) == content


def test_clean_truncated_reply_caps_long_stop_reply_even_without_length_cutoff():
    sentences = [f"Cümle {i}." for i in range(1, 9)]
    content = " ".join(sentences)
    result = _clean_truncated_reply(_msg(content, "stop"))
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES])


def test_clean_truncated_reply_trims_mid_sentence_cutoff_within_limit():
    content = "Cümle 1. Cümle 2. Cümle 3. bu kısım num_predict'e takılıp yarım kaldı"
    result = _clean_truncated_reply(_msg(content, "length"))
    assert result == "Cümle 1. Cümle 2. Cümle 3."


def test_clean_truncated_reply_applies_both_length_trim_and_sentence_cap():
    sentences = [f"Cümle {i}." for i in range(1, 10)]
    content = " ".join(sentences) + " yarım kalan son parça"
    result = _clean_truncated_reply(_msg(content, "length"))
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES])


def test_clean_truncated_reply_with_no_sentence_boundaries_and_length_cutoff():
    content = "hic noktalama olmadan yarim kalan bir yanit"
    assert _clean_truncated_reply(_msg(content, "length")) == content
