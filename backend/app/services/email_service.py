import logging
import smtplib
from email.message import EmailMessage
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _send_email(to_email: str, subject: str, body: str, log_body: str | None = None) -> None:
    """SMTP ayarlanmışsa (settings.smtp_host) gerçek e-posta gönderir.
    Ayarlanmamışsa (dev/test ortamı varsayılanı) içeriği sadece log'a yazar -
    proje henüz kişisel/dev aşamasında olduğu için gerçek bir e-posta
    sağlayıcısı kurulana kadar mekanizma böyle test edilebiliyor. SMTP kimlik
    bilgileri elde edildiğinde sadece .env'e eklenmesi yeterli, kod tarafında
    değişiklik gerekmez (2026-08-03'te Gmail SMTP ile gerçek teslimat
    doğrulandı).

    `log_body`, dev-modu log satırında GERÇEK `body` yerine yazdırılacak
    (redakte edilmiş) bir metin - hassas token içeren linkler (bkz.
    send_password_reset_email) SMTP yapılandırılmadığı sürece stdout/log
    akışına düz metin yazılmasın diye (2026-08-26 güvenlik denetimi). Gerçek
    gönderim her zaman `body`'yi kullanır, sadece log satırı etkilenir."""
    if not settings.smtp_host:
        logger.info(
            "[DEV MODU - e-posta gönderilmedi] %s (%s için): %s",
            subject,
            to_email,
            log_body if log_body is not None else body,
        )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    # reset_link "{frontend_base_url}/reset-password?token={raw_token}"
    # formatında (bkz. password_reset_service.py) - ham token'ı taşıyor, tek
    # kullanımlık olsa da 60dk geçerli (bkz. config.py
    # password_reset_token_expire_minutes). Log satırında sadece "?token="
    # öncesi (yol) gösterilir, token'ın kendisi asla loglanmaz.
    redacted_link = reset_link.split("?token=", 1)[0] + "?token=[REDACTED]"
    _send_email(
        to_email,
        "PulseCoach - Şifre Sıfırlama",
        "Şifreni sıfırlamak için aşağıdaki linke tıkla (1 saat geçerli):\n\n"
        f"{reset_link}\n\n"
        "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.",
        log_body=f"Şifre sıfırlama linki oluşturuldu: {redacted_link}",
    )


def send_checkin_email(to_email: str, message: str) -> None:
    """Haftalık proaktif check-in mesajını e-posta olarak da gönderir -
    öncesinde check-in'ler SADECE uygulama içinde ("Check-in Mesajları"
    sekmesi) görünüyordu, kullanıcı o gün uygulamayı açmazsa kaçırıyordu."""
    _send_email(to_email, "PulseCoach - Haftalık Check-in", message)
