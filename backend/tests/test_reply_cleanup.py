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


# --- Sıralı liste maddesi numaraları cümle sonu SAYILMAMALI (2026-08-13) ---
# Kullanıcı canlı sohbette yakaladı: "1. **Mola Ver:** ... ver.\n2." gibi bir
# yanıt sadece 4 gerçek cümle + 2 liste numarası ("1.", "2.") içeriyordu ama
# _SENTENCE_END_RE ikisini de cümle sonu saydığı için MAX_REPLY_SENTENCES=6'ya
# tam "2."de ulaşılıp geri kalan liste maddesi/içeriği koptu.


def test_cap_sentence_count_does_not_count_list_markers_as_sentences():
    content = (
        "Bu büyük bir hedef! Odaklanman harika. Kendine iyi bak. Şunları dene:\n"
        "1.  Mola ver: 45-50 dakikada bir kısa mola ver.\n"
        "2.  Bol su iç: Beynin susuz odaklanamaz.\n"
        "3.  Uyku düzenine dikkat et: Az uyku hafızayı zayıflatır."
    )
    # 4 gerçek cümle var ("hedef!", "harika.", "bak.", "ver." "iç." "et.")
    # + "Şunları dene:" (noktalama yok, sayılmaz) - liste maddesi sonlarıyla
    # birlikte 6 gerçek cümle sonu var, ama "1."/"2."/"3." SAYILMAMALI.
    result = _cap_sentence_count(content, MAX_REPLY_SENTENCES)
    assert result == content
    assert "3.  Uyku düzenine dikkat et" in result


def test_cap_sentence_count_still_trims_when_real_sentences_exceed_limit_in_a_list():
    content = "Giriş cümlesi.\n" + "\n".join(f"{i}. Madde {i} içeriği." for i in range(1, 9))
    result = _cap_sentence_count(content, MAX_REPLY_SENTENCES)
    expected_sentences = ["Giriş cümlesi."] + [f"{i}. Madde {i} içeriği." for i in range(1, MAX_REPLY_SENTENCES)]
    assert result == "\n".join(expected_sentences)


def test_clean_truncated_reply_does_not_cut_list_off_at_second_item_number():
    """Regresyon: kullanıcının canlı sohbette gördüğü tam senaryo - yanıt
    "2."de (madde içeriği hiç yazılmadan) kesilmemeli."""
    content = (
        "Bu büyük bir hedef ve bu kadar odaklanman bile ne kadar kararlı "
        "olduğunu gösteriyor! Unutma ki başarı sadece zihinsel çaba değil, "
        "aynı zamanda fiziksel sağlığınla da yakından ilişkilidir. Bu yoğun "
        "dönemde kendini ihmal etmemek çok önemli. Çalışmalarına destek olmak "
        "adına sana birkaç küçük hatırlatma yapmak isterim:\n"
        "1.  Mola Ver: Uzun çalışma seansları yerine, 45-50 dakikalık "
        "odaklanmış çalışmanın ardından mutlaka kısa molalar ver.\n"
        "2.  Bol Su İç: Beynin susuz kalınca odaklanmakta zorlanır.\n"
        "3.  Uykuna Dikkat Et: Yetersiz uyku hafızayı ciddi şekilde zayıflatır."
    )
    result = _clean_truncated_reply(_msg(content, "stop"))
    assert result == content
    assert "3.  Uykuna Dikkat Et" in result
