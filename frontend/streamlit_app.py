import pandas as pd
import streamlit as st
import api_client as api

WORKOUT_TYPES = ["kuvvet", "kardiyo", "esneklik", "karışık"]

st.set_page_config(page_title="PulseCoach", page_icon="💪", layout="centered")


def _init_state():
    st.session_state.setdefault("token", None)
    st.session_state.setdefault("email", None)


def _logout():
    st.session_state["token"] = None
    st.session_state["email"] = None


def render_auth_screen():
    st.title("💪 PulseCoach")
    st.caption("Sağlıklı Yaşam Koçu — giriş yap veya hesap oluştur")

    mode = st.radio("", ["Giriş Yap", "Kayıt Ol"], horizontal=True, label_visibility="collapsed")

    if mode == "Giriş Yap":
        with st.form("login_form"):
            email = st.text_input("E-posta", key="login_email")
            password = st.text_input("Şifre", type="password", key="login_password")
            submitted = st.form_submit_button("Giriş Yap")
        if submitted:
            try:
                token = api.login(email, password)
                st.session_state["token"] = token
                st.session_state["email"] = email
                st.rerun()
            except api.ApiError as exc:
                st.error(str(exc))
    else:
        with st.form("register_form"):
            email = st.text_input("E-posta", key="register_email")
            password = st.text_input("Şifre", type="password", key="register_password")
            password_confirm = st.text_input("Şifre (tekrar)", type="password", key="register_password_confirm")
            submitted = st.form_submit_button("Kayıt Ol")
        if submitted:
            if password != password_confirm:
                st.error("Şifreler eşleşmiyor.")
            else:
                try:
                    api.register(email, password)
                    st.success("Kayıt başarılı! Şimdi 'Giriş Yap' sekmesinden giriş yapabilirsin.")
                except api.ApiError as exc:
                    st.error(str(exc))


def render_chat_tab(token: str):
    st.subheader("Sohbet")
    try:
        history = api.get_chat_history(token)
    except api.ApiError as exc:
        st.error(str(exc))
        history = []

    for entry in history:
        role = "user" if entry["role"] == "user" else "assistant"
        with st.chat_message(role):
            st.write(entry["content"])

    message = st.chat_input("Bir mesaj yaz...")
    if message:
        with st.chat_message("user"):
            st.write(message)
        try:
            with st.spinner("Koç düşünüyor..."):
                response = api.send_chat_message(token, message)
            with st.chat_message("assistant"):
                st.write(response["reply"])
        except api.ApiError as exc:
            st.error(str(exc))


def render_log_progress_tab(token: str):
    st.subheader("İlerleme Kaydet")
    # Not st.form: koşullu alanların (kilo/antrenman türü) checkbox işaretlenir
    # işaretlenmez görünmesi için widget'ların HER değişiklikte anında rerun
    # tetiklemesi gerekiyor — form içindeki widget'lar bunu sadece submit'te yapar.
    record_weight = st.checkbox("Kilo girmek istiyorum")
    weight = None
    if record_weight:
        weight = st.number_input("Kilo (kg)", min_value=0.0, max_value=500.0, step=0.1)

    workout_completed = st.checkbox("Bugün antrenman yaptım")
    workout_type = None
    if workout_completed:
        workout_type = st.selectbox("Antrenman türü", WORKOUT_TYPES)

    submitted = st.button("Kaydet")

    if submitted:
        try:
            api.log_progress(
                token,
                weight=weight,
                workout_completed=workout_completed,
                workout_type=workout_type,
            )
            st.success("Kaydedildi!")
        except api.ApiError as exc:
            st.error(str(exc))


def render_charts_tab(token: str):
    st.subheader("İlerleme Grafikleri")
    try:
        summary = api.get_weekly_summary(token)
        logs = api.get_progress_logs(token, days=90)
    except api.ApiError as exc:
        st.error(str(exc))
        return

    st.info(summary["summary_text"])

    if not logs:
        st.write("Henüz grafik için yeterli veri yok. İlerleme Kaydet sekmesinden kayıt ekleyebilirsin.")
        return

    df = pd.DataFrame(logs)
    df["log_date"] = pd.to_datetime(df["log_date"])

    weight_df = df.dropna(subset=["weight"])
    if not weight_df.empty:
        st.write("Kilo değişimi")
        st.line_chart(weight_df.set_index("log_date")["weight"])

    workout_df = df[df["workout_completed"] & df["workout_type"].notna()]
    if not workout_df.empty:
        st.write("Antrenman türü dağılımı")
        st.bar_chart(workout_df["workout_type"].value_counts())


def render_checkins_tab(token: str):
    st.subheader("Check-in Mesajları")
    try:
        checkins = api.get_checkins(token)
    except api.ApiError as exc:
        st.error(str(exc))
        return

    if not checkins:
        st.write("Henüz bir check-in mesajın yok. Haftalık özet zamanı geldiğinde burada görünecek.")
        return

    for item in checkins:
        prefix = "🆕 " if not item["delivered"] else ""
        st.info(f"{prefix}{item['message']}")


def render_app():
    with st.sidebar:
        st.write(f"Giriş yapan: **{st.session_state['email']}**")
        if st.button("Çıkış Yap"):
            _logout()
            st.rerun()

    st.title("💪 PulseCoach")

    chat_tab, log_tab, charts_tab, checkins_tab = st.tabs(
        ["Sohbet", "İlerleme Kaydet", "İlerleme Grafikleri", "Check-in Mesajları"]
    )
    with chat_tab:
        render_chat_tab(st.session_state["token"])
    with log_tab:
        render_log_progress_tab(st.session_state["token"])
    with charts_tab:
        render_charts_tab(st.session_state["token"])
    with checkins_tab:
        render_checkins_tab(st.session_state["token"])


_init_state()
_screen = st.empty()
with _screen.container():
    if st.session_state["token"]:
        render_app()
    else:
        render_auth_screen()
