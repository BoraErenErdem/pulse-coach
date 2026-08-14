import pytest
from langchain_core.messages import AIMessage

from app.agents.orchestrator import (
    MAX_REPLY_SENTENCES_BRIEF,
    MAX_REPLY_SENTENCES_DETAILED,
    MAX_REPLY_SENTENCES_MEDIUM,
    _cap_sentence_count,
    _clean_truncated_reply,
)


def _msg(content: str, done_reason: str = "stop") -> AIMessage:
    return AIMessage(content=content, response_metadata={"done_reason": done_reason})


# --- _cap_sentence_count: fonksiyonun kendisi genel amaçlı, davranışını
# üretim sabitlerinden bağımsız (yerel bir LIMIT ile) test ediyoruz - hangi
# katman sabiti değişirse değişsin bu testler geçerli kalır.
LIMIT = 6


def test_cap_sentence_count_leaves_short_reply_untouched():
    content = "Bir. İki. Üç."
    assert _cap_sentence_count(content, LIMIT) == content


def test_cap_sentence_count_leaves_reply_at_exact_limit_untouched():
    content = " ".join(f"Cümle {i}." for i in range(1, LIMIT + 1))
    assert _cap_sentence_count(content, LIMIT) == content


def test_cap_sentence_count_trims_reply_over_limit():
    sentences = [f"Cümle {i}." for i in range(1, 9)]
    content = " ".join(sentences)
    result = _cap_sentence_count(content, LIMIT)
    assert result == " ".join(sentences[:LIMIT])
    assert result.count(".") == LIMIT


def test_cap_sentence_count_ignores_content_without_sentence_boundaries():
    content = "noktalama yok bu metinde"
    assert _cap_sentence_count(content, LIMIT) == content


# --- _clean_truncated_reply: user_message'a göre üç katmandan (BRIEF/MEDIUM/
# DETAILED) hangisinin seçildiğini test ediyor (2026-08-14, "kısa iste->kısa,
# hiçbir şey deme->orta, detaylı iste->uzun" ilkesiyle 3 katmana ayrıldı -
# eskiden tek bir MAX_REPLY_SENTENCES=6 vardı ve "kahvaltıda ne yemeliyim?"
# gibi ne kısa ne detaylı istenen orta seviye bilgi sorularını da aynı sert
# sınıra sıkıştırıyordu).


def test_clean_truncated_reply_leaves_short_stop_reply_untouched():
    content = "Bugün harika gidiyorsun. Böyle devam et."
    assert _clean_truncated_reply(_msg(content, "stop"), "Nasılım?") == content


def test_clean_truncated_reply_defaults_to_medium_when_no_length_cue():
    """Ne kısa ne detay istenmemişse (ör. sıradan bir bilgi sorusu)
    MAX_REPLY_SENTENCES_MEDIUM uygulanır."""
    sentences = [f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES_MEDIUM + 5)]
    content = " ".join(sentences)
    result = _clean_truncated_reply(_msg(content, "stop"), "Kahvaltıda ne yemeliyim?")
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES_MEDIUM])


def test_clean_truncated_reply_uses_brief_limit_when_user_asks_short():
    sentences = [f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES_MEDIUM + 5)]
    content = " ".join(sentences)
    result = _clean_truncated_reply(_msg(content, "stop"), "Su içmek neden önemli, kısaca söyle.")
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES_BRIEF])


def test_clean_truncated_reply_uses_detailed_limit_when_user_asks_detail():
    sentences = [f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES_DETAILED + 5)]
    content = " ".join(sentences)
    result = _clean_truncated_reply(
        _msg(content, "stop"), "Protein alımı hakkında çok detaylı ve kapsamlı bilgi ver."
    )
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES_DETAILED])


def test_clean_truncated_reply_brief_wins_over_detail_when_both_requested():
    """Çelişkili istek (ör. 'kısaca ama detaylı') - kullanıcının literal
    kelimesine sadık kalınıp BRIEF kazanır."""
    sentences = [f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES_MEDIUM + 5)]
    content = " ".join(sentences)
    result = _clean_truncated_reply(_msg(content, "stop"), "Kısaca ama detaylı anlat.")
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES_BRIEF])


def test_clean_truncated_reply_trims_mid_sentence_cutoff_within_limit():
    content = "Cümle 1. Cümle 2. Cümle 3. bu kısım num_predict'e takılıp yarım kaldı"
    result = _clean_truncated_reply(_msg(content, "length"), "Merhaba")
    assert result == "Cümle 1. Cümle 2. Cümle 3."


def test_clean_truncated_reply_applies_both_length_trim_and_sentence_cap():
    sentences = [f"Cümle {i}." for i in range(1, MAX_REPLY_SENTENCES_MEDIUM + 6)]
    content = " ".join(sentences) + " yarım kalan son parça"
    result = _clean_truncated_reply(_msg(content, "length"), "Merhaba")
    assert result == " ".join(sentences[:MAX_REPLY_SENTENCES_MEDIUM])


def test_clean_truncated_reply_with_no_sentence_boundaries_and_length_cutoff():
    content = "hic noktalama olmadan yarim kalan bir yanit"
    assert _clean_truncated_reply(_msg(content, "length"), "Merhaba") == content


# --- Sıralı liste maddesi numaraları cümle sonu SAYILMAMALI (2026-08-13) ---
# Kullanıcı canlı sohbette yakaladı: "1. **Mola Ver:** ... ver.\n2." gibi bir
# yanıt sadece 4 gerçek cümle + 2 liste numarası ("1.", "2.") içeriyordu ama
# _SENTENCE_END_RE ikisini de cümle sonu saydığı için tavana tam "2."de
# ulaşılıp geri kalan liste maddesi/içeriği koptu.


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
    result = _cap_sentence_count(content, LIMIT)
    assert result == content
    assert "3.  Uyku düzenine dikkat et" in result


def test_cap_sentence_count_still_trims_when_real_sentences_exceed_limit_in_a_list():
    content = "Giriş cümlesi.\n" + "\n".join(f"{i}. Madde {i} içeriği." for i in range(1, 9))
    result = _cap_sentence_count(content, LIMIT)
    expected_sentences = ["Giriş cümlesi."] + [f"{i}. Madde {i} içeriği." for i in range(1, LIMIT)]
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
    result = _clean_truncated_reply(_msg(content, "stop"), "Nasıl daha odaklı çalışırım?")
    assert result == content
    assert "3.  Uykuna Dikkat Et" in result


# --- Markdown BAŞLIK satırları (Romen rakamlı "I."/"II." dahil) cümle sonu
# SAYILMAMALI (2026-08-14) - "### I. Protein İhtiyacı: Ne Kadar Almalıyım?"
# gibi bir başlıkta "I."deki nokta cümle sonu sanılıp yanıt başlığın TAM
# ORTASINDA kesiliyordu.


def test_cap_sentence_count_does_not_cut_inside_roman_numeral_heading():
    content = (
        "Giriş cümlesi burada bitiyor. İkinci cümle de burada bitiyor.\n\n"
        "### 🥩 I. Protein İhtiyacı: Ne Kadar Almalıyım?\n\n"
        "Protein ihtiyacı aktivite seviyesine göre değişir. Genel popülasyon "
        "için önerilen miktar 0.8 gram civarındadır. Aktif sporcular için "
        "bu oran belirgin şekilde yükselir."
    )
    result = _cap_sentence_count(content, LIMIT)
    # Baslik satirinin TAMAMI kirpma noktasi olarak asla secilmemeli - ya
    # basliktan once ya da basliktan tamamen sonra bitmeli.
    assert "### 🥩 I." not in result or "### 🥩 I. Protein İhtiyacı: Ne Kadar Almalıyım?" in result
