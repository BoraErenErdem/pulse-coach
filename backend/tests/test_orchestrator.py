import pytest
from langchain_core.messages import AIMessage, ToolMessage
from sqlalchemy.orm import sessionmaker

from app.agents import mood_support_agent
from app.agents import orchestrator as orchestrator_module
from app.db.base import Base
from app.models.user import User
from app.models.user_profile import UserProfile
from app.services import conversation_service
from tests.db_utils import make_test_engine


@pytest.fixture()
def db_session():
    engine = make_test_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    user = User(email="orchestrator@example.com", hashed_password="x")
    session.add(user)
    session.commit()
    session.refresh(user)
    try:
        yield session, user.id
    finally:
        session.close()


class _RaisingAgent:
    def invoke(self, *args, **kwargs):
        raise ConnectionError("Ollama'ya bağlanılamadı")


def test_run_orchestrator_returns_fallback_when_llm_invoke_fails(db_session, monkeypatch):
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *args, **kwargs: _RaisingAgent())

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "Merhaba")

    # Profilsiz kullanıcı -> preferred_language varsayılanı "tr" (bkz.
    # UserProfile.preferred_language / profile_service.get_language).
    assert reply == orchestrator_module.LLM_ERROR_FALLBACK["tr"]
    assert agent_used == "orchestrator"


def test_run_orchestrator_returns_english_fallback_for_english_profile(db_session, monkeypatch):
    # Faz 3: preferred_language="en" olan bir kullanıcı, LLM'i hiç görmeyen
    # sabit hata mesajını da (dict[language] üzerinden) İngilizce almalı.
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, preferred_language="en"))
    session.commit()
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *args, **kwargs: _RaisingAgent())

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "Hello")

    assert reply == orchestrator_module.LLM_ERROR_FALLBACK["en"]
    assert agent_used == "orchestrator"


def test_run_orchestrator_passes_coach_tone_into_system_prompt(db_session, monkeypatch):
    """Regresyon: coach_tone önceden SADECE push/check-in mesajlarını
    etkiliyordu, interaktif sohbet (run_orchestrator) hiç kullanmıyordu -
    kullanıcı fark edip sordu (2026-08-13). Kullanıcının seçtiği ton artık
    sohbetin system prompt'una da geçmeli."""
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, coach_tone="enerjik"))
    session.commit()

    captured_system_prompts = []

    def _capture_create_agent(*args, **kwargs):
        captured_system_prompts.append(kwargs.get("system_prompt"))
        return _RaisingAgent()

    monkeypatch.setattr(orchestrator_module, "create_agent", _capture_create_agent)

    orchestrator_module.run_orchestrator(session, user_id, "Merhaba")

    assert len(captured_system_prompts) == 1
    assert "Ton: Enerjik ve coşkulu ol" in captured_system_prompts[0]


class _CapturingAgent:
    """create_agent() yerine kullanılıp .invoke()'a giden `messages` listesini
    (history + yeni kullanıcı mesajı) yakalar, gerçek LLM'e hiç gitmez."""

    def __init__(self, sink):
        self._sink = sink

    def invoke(self, payload, config=None):
        self._sink.append(list(payload["messages"]))
        return {"messages": [AIMessage(content="tamam")]}


def test_run_orchestrator_excludes_history_before_soft_clear(db_session, monkeypatch):
    """"Sohbeti Sıfırla" koçun bağlamını da temizlemeli - aksi halde ekranda
    "temiz sayfa" gösterip arka planda eski konuya devam ediyormuş gibi
    cevap verirdi (bkz. conversation_service.get_cleared_at,
    orchestrator._load_history)."""
    session, user_id = db_session
    conversation_service.save_turn(session, user_id, "eski mesaj", "eski cevap", "orchestrator")
    conversation_service.soft_clear(session, user_id)
    conversation_service.save_turn(session, user_id, "yeni mesaj", "yeni cevap", "orchestrator")

    captured: list[list] = []
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _CapturingAgent(captured))

    orchestrator_module.run_orchestrator(session, user_id, "devam ediyoruz")

    assert len(captured) == 1
    history_contents = [msg.content for msg in captured[0][:-1]]  # son eleman az önce eklenen kullanıcı mesajı
    assert "eski mesaj" not in history_contents
    assert "eski cevap" not in history_contents
    assert "yeni mesaj" in history_contents
    assert "yeni cevap" in history_contents


class _EmptyFinalReplyAgent:
    """create_agent() yerine kullanılıp gerçek hayattaki 'tool-call'lar
    başarıyla çalıştı ama son mesaj boş içerikli' durumunu simüle eder (bkz.
    canlı testte bulunan gemma4:e4b reasoning-bütçesi tükenmesi sorunu,
    2026-08-31)."""

    def invoke(self, payload, config=None):
        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "log_exercise_sets_bulk", "args": {}, "id": "1"}],
        )
        # Gerçek akışta ToolNode her çağrının sonucunu ToolMessage olarak ekler
        # (orchestrator artık başarılı ToolMessage'lara bakıyor).
        tool_result = ToolMessage(content="3 set kaydedildi.", name="log_exercise_sets_bulk", tool_call_id="1")
        empty_final = AIMessage(content="")
        return {"messages": [*payload["messages"], tool_call_msg, tool_result, empty_final]}


class _FailedToolThenSuccessClaimAgent:
    """eval/chat_regression.py ile yakalandı (2026-09-23): araç doğrulama
    hatasıyla çöktü (ToolMessage.status="error") ama model yine de
    "kaydettim" dedi."""

    def invoke(self, payload, config=None):
        tool_call_msg = AIMessage(
            content="",
            tool_calls=[{"name": "log_exercise_set", "args": {"set_count": None}, "id": "1"}],
        )
        tool_error = ToolMessage(
            content="Error invoking tool 'log_exercise_set'", name="log_exercise_set", tool_call_id="1", status="error"
        )
        claim = AIMessage(content="Harika! Koşunu başarıyla kaydettim.")
        return {"messages": [*payload["messages"], tool_call_msg, tool_error, claim]}


class _EmptyFinalReplyNoToolsAgent:
    """Aynı boş-final senaryosu ama HİÇ tool çağrılmadan - retry hiç
    tetiklenmemeli (kaydedilen bir şey yok, dürüst 'kaydedemedim' mesajı
    doğru davranış)."""

    def invoke(self, payload, config=None):
        return {"messages": [*payload["messages"], AIMessage(content="")]}


class _FakeRetryLLM:
    def __init__(self, content):
        self._content = content
        self.calls = 0

    def invoke(self, messages):
        self.calls += 1
        return AIMessage(content=self._content)


def test_run_orchestrator_retries_on_empty_reply_and_recovers(db_session, monkeypatch):
    """Regresyon: tool-call'lar başarıyla çalıştıktan sonra final mesaj boş
    gelirse, kullanıcıya hemen 'özetleyemedim' demek yerine AYNI mesaj
    geçmişiyle bir kez daha (araç çağırmayan) LLM'den özet istenmeli - bu
    çoğu zaman başarır (canlı testte doğrulandı)."""
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _EmptyFinalReplyAgent())
    fake_llm = _FakeRetryLLM("3 set başarıyla kaydedildi, tebrikler!")
    monkeypatch.setattr(orchestrator_module, "get_llm", lambda model_name=None: fake_llm)

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "squat yaptım")

    assert reply == "3 set başarıyla kaydedildi, tebrikler!"
    assert agent_used == "workout_tracking_agent"
    assert fake_llm.calls == 1


def test_run_orchestrator_falls_back_when_retry_also_empty(db_session, monkeypatch):
    """Retry de boş dönerse (nadir), yine de dürüst sabit fallback mesajına
    düşülmeli - sessiz boş yanıt asla kullanıcıya gitmemeli."""
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _EmptyFinalReplyAgent())
    fake_llm = _FakeRetryLLM("")
    monkeypatch.setattr(orchestrator_module, "get_llm", lambda model_name=None: fake_llm)

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "squat yaptım")

    assert reply == orchestrator_module.EMPTY_REPLY_WITH_TOOLS_FALLBACK["tr"]
    assert fake_llm.calls == 1


def test_run_orchestrator_does_not_retry_when_no_tools_used(db_session, monkeypatch):
    """Hiç tool çağrılmadıysa (kaydedilen bir şey yok) retry'a hiç gerek
    yok - dürüst 'kaydedemedim' fallback'i direkt dönmeli, gereksiz bir LLM
    çağrısı yapılmamalı."""
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _EmptyFinalReplyNoToolsAgent())
    fake_llm = _FakeRetryLLM("bu hiç kullanılmamalı")
    monkeypatch.setattr(orchestrator_module, "get_llm", lambda model_name=None: fake_llm)

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "merhaba")

    assert reply == orchestrator_module.EMPTY_REPLY_NO_TOOLS_FALLBACK["tr"]
    assert fake_llm.calls == 0


def test_run_orchestrator_crisis_response_respects_language(db_session):
    session, user_id = db_session
    session.add(UserProfile(user_id=user_id, preferred_language="en"))
    session.commit()

    reply, agent_used = orchestrator_module.run_orchestrator(
        session, user_id, "Kendimi öldürmek istiyorum"
    )

    assert reply == mood_support_agent.CRISIS_RESPONSE_EN
    assert agent_used == "mood_support_agent"


@pytest.mark.parametrize(
    ("language", "expected"),
    [
        ("tr", mood_support_agent.CRISIS_RESPONSE_TR),
        ("en", mood_support_agent.CRISIS_RESPONSE_EN),
        ("xx", mood_support_agent.CRISIS_RESPONSE_TR),  # bilinmeyen dil -> TR'ye düşer
    ],
)
def test_get_crisis_response_selects_by_language(language, expected):
    assert mood_support_agent.get_crisis_response(language) == expected


def test_has_false_success_claim_catches_english_pattern():
    assert orchestrator_module._has_false_success_claim(
        "I've saved this workout for you, great job!", "en"
    )
    assert not orchestrator_module._has_false_success_claim(
        "I added this to your plan.", "en"
    )


def test_has_false_success_claim_catches_turkish_pattern():
    assert orchestrator_module._has_false_success_claim("Bunu kaydettim!", "tr")
    assert not orchestrator_module._has_false_success_claim("Bunu ekledim.", "tr")


def test_run_orchestrator_rejects_success_claim_when_write_tool_failed(db_session, monkeypatch):
    session, user_id = db_session
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: _FailedToolThenSuccessClaimAgent())

    reply, _agent_used = orchestrator_module.run_orchestrator(session, user_id, "25 dakika koştum")

    assert reply == orchestrator_module.EMPTY_REPLY_NO_TOOLS_FALLBACK["tr"]



# ---- 2026-09-26: araç çağırmadan "kaydettim" -> bir kez notla yeniden dene


class _ClaimsThenLogsOnRetryAgent:
    """İlk çağrıda araçsız sahte "kaydettim"; notlu ikinci çağrıda gerçekten kaydeder."""

    def __init__(self, logs_on_retry=True):
        self.payloads = []
        self.logs_on_retry = logs_on_retry

    def invoke(self, payload, config=None):
        self.payloads.append(payload)
        if len(self.payloads) == 1 or not self.logs_on_retry:
            return {"messages": [*payload["messages"], AIMessage(content="Mercimek çorbanı kaydettim!")]}
        call = AIMessage(content="", tool_calls=[{"name": "log_meal", "args": {}, "id": "1"}])
        done = ToolMessage(content="Kaydedildi: Mercimek çorbası", name="log_meal", tool_call_id="1")
        return {"messages": [*payload["messages"], call, done, AIMessage(content="Mercimek çorbanı kaydettim!")]}


def test_false_save_claim_without_tools_is_retried_once_with_note(db_session, monkeypatch):
    session, user_id = db_session
    agent = _ClaimsThenLogsOnRetryAgent()
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    reply, agent_used = orchestrator_module.run_orchestrator(session, user_id, "bir tabak mercimek çorbası içtim")

    assert reply == "Mercimek çorbanı kaydettim!"
    assert len(agent.payloads) == 2
    retried_user_message = agent.payloads[1]["messages"][-1].content
    assert retried_user_message.startswith("bir tabak mercimek çorbası içtim")
    assert "Sistem notu" in retried_user_message


def test_false_save_claim_retry_happens_only_once(db_session, monkeypatch):
    session, user_id = db_session
    agent = _ClaimsThenLogsOnRetryAgent(logs_on_retry=False)
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    reply, _agent_used = orchestrator_module.run_orchestrator(session, user_id, "bir tabak mercimek çorbası içtim")

    assert reply == orchestrator_module.EMPTY_REPLY_NO_TOOLS_FALLBACK["tr"]
    assert len(agent.payloads) == 2


def test_false_save_claim_after_failed_write_tool_is_retried_once(db_session, monkeypatch):
    """status="error" yalnız argüman/şema hatası (değer hataları düz metin döner) -
    yeniden deneme bunu düzeltebilir; yazma başarılı olmadığı için çift kayıt yok."""
    session, user_id = db_session
    agent = _FailedToolThenSuccessClaimAgent()
    calls = []
    original = agent.invoke
    agent.invoke = lambda payload, config=None: calls.append(1) or original(payload, config)
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    reply, _agent_used = orchestrator_module.run_orchestrator(session, user_id, "25 dakika koştum")

    assert reply == orchestrator_module.EMPTY_REPLY_NO_TOOLS_FALLBACK["tr"]
    assert len(calls) == 2



# ---- 2026-09-26: düzeltme/silme aracı yok - "düzelttim/sildim" iddiası yakalanır


class _ClaimsEditAgent:
    def __init__(self):
        self.calls = 0

    def invoke(self, payload, config=None):
        self.calls += 1
        reply = AIMessage(content="Hemen düzeltiyorum! Leg press setini 100 kg olarak güncelliyorum.")
        return {"messages": [*payload["messages"], reply]}


def test_false_edit_claim_is_replaced_without_retry(db_session, monkeypatch):
    session, user_id = db_session
    agent = _ClaimsEditAgent()
    monkeypatch.setattr(orchestrator_module, "create_agent", lambda *a, **kw: agent)

    reply, _agent_used = orchestrator_module.run_orchestrator(session, user_id, "az önceki leg press 100 olacaktı düzelt")

    assert reply == orchestrator_module.EDIT_NOT_SUPPORTED_REPLY["tr"]
    assert agent.calls == 1


def test_edit_claim_regex_ignores_advice_and_similar_words():
    for text in ("Formunu düzeltmek için dizlerini dışa it.", "Silindir gibi bir köpük rulo kullan.", "Güncel kilon 84 kg."):
        assert not orchestrator_module._has_false_edit_claim(text, "tr")
    for text in ("Kaydı sildim.", "Tam buğday ekmeği kaydını çıkardım.", "Setini düzelttim."):
        assert orchestrator_module._has_false_edit_claim(text, "tr")


def test_edit_offer_sentence_is_replaced_with_in_app_hint():
    """2026-09-28 canlı test: şüpheli 400 kg bench kaydında koç "doğru ağırlığı
    söylersen güncelleyebilirim" dedi - düzenleme aracı yok, söyleseydi ikinci kayıt
    oluşurdu. Vaat cümlesi atılır, uygulamada düzeltme yolu eklenir."""
    reply = "400 kg çok yüksek görünüyor, yazım hatası mı? Eğer yanlışsa doğru ağırlığı söylersen güncelleyebilirim. 😊"
    fixed = orchestrator_module._replace_edit_offer(reply, "tr")
    assert "güncelleyebilirim" not in fixed
    assert fixed.startswith("400 kg çok yüksek görünüyor, yazım hatası mı?")
    assert fixed.endswith(orchestrator_module.EDIT_IN_APP_HINT["tr"])
    assert "düzeltmemi" not in orchestrator_module._replace_edit_offer("Düzeltmemi ister misin?", "tr")
    # Kullanıcıya yol gösteren "düzeltebilirsin" dokunulmadan kalır
    hint = "Yanlışsa Antrenman sekmesinde kaydı sağa kaydırıp düzeltebilirsin."
    assert orchestrator_module._replace_edit_offer(hint, "tr") == hint
    assert "update" not in orchestrator_module._replace_edit_offer("Nice! I can update it for you.", "en").split("\n")[0]


def test_workout_summary_is_appended_when_reply_skips_exercise_names():
    """2026-09-28 canlı test: koç yanlış eşleşen hareketleri de tekrar diye atlananları
    da anmadan "tüm hareketlerini kaydettim" dedi. Özet kodla eklenir."""
    from app.agents.workout_tracking_agent import WorkoutTurnSummary

    summary = WorkoutTurnSummary(logged={"Dambıl Sehpada Göğüs Presi": 3, "Triceps Aşağı İtme": 4}, skipped=["Peck Deck Makinesi"])
    reply = orchestrator_module._append_workout_summary("Harika antrenman, hepsini kaydettim!", summary, "tr")
    assert "Kaydedilen hareketler: Dambıl Sehpada Göğüs Presi (3 set), Triceps Aşağı İtme (4 set)." in reply
    assert "tekrar eklenmeyenler: Peck Deck Makinesi." in reply
    # Yanıt zaten hepsini anıyorsa ya da tek hareket varsa dokunulmaz
    named = "Dambıl Sehpada Göğüs Presi, Triceps Aşağı İtme ve Peck Deck Makinesi tamam."
    assert orchestrator_module._append_workout_summary(named, summary, "tr") == named
    cardio = WorkoutTurnSummary(logged={"Barfiks": 4, "Yürüyüş": 1}, minutes={"Yürüyüş": 15.0})
    assert "Barfiks (4 set), Yürüyüş (15 dk)." in orchestrator_module._append_workout_summary("Tamam.", cardio, "tr")
    single = WorkoutTurnSummary(logged={"Squat (Çömelme)": 3})
    assert orchestrator_module._append_workout_summary("Kaydettim.", single, "tr") == "Kaydettim."


def test_correction_request_detection():
    """2026-09-28 canlı test: düzeltme isteğinde koç yeni kayıtlar açıp "güncellemeler
    başarıyla yapıldı" dedi (yinelenen veri). Yeni ölçüm bildirimi engellenmemeli."""
    detect = orchestrator_module.is_correction_request
    assert detect("Pardon yanlış söylemişim, dünkü bisiklet 45 değil 50 dakikaydı. Kiloyu 27 Eylül'e yazmışsın")
    assert detect("az önceki squat 100 kilo olacaktı, düzeltir misin?")
    assert detect("ekmeği sil")
    assert not detect("kilomu güncelle, 82 oldum")
    assert not detect("Bugün squat 3x10 60kg yaptım")
    assert not detect("yanlış beslendim bugün, 2 dilim pizza yedim")


def test_blocked_log_tool_keeps_schema_and_saves_nothing():
    from langchain_core.tools import tool

    @tool
    def log_meal(food_name: str, quantity_grams: float) -> str:
        """Öğün kaydeder."""
        raise AssertionError("düzeltme turunda çağrılmamalı")

    blocked = orchestrator_module._blocked_log_tool(log_meal)
    assert blocked.name == "log_meal" and blocked.args == log_meal.args
    assert blocked.invoke({"food_name": "ekmek", "quantity_grams": 50}).startswith("Kaydedilmedi")


def test_done_claim_detection_for_correction_turn():
    assert orchestrator_module._claims_done("✅ Güncellemeler başarıyla yapıldı", "tr")
    assert orchestrator_module._claims_done("Kiloyu bugüne taşıdım.", "tr")
    assert not orchestrator_module._claims_done("Bunu sohbetten düzenleyemiyorum.", "tr")
