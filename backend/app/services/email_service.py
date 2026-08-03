import logging
import smtplib
from email.message import EmailMessage
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _send_email(to_email: str, subject: str, body: str) -> None:
    """SMTP ayarlanmışsa (settings.smtp_host) gerçek e-posta gönderir.
    Ayarlanmamışsa (dev/test ortamı varsayılanı) içeriği sadece log'a yazar -
    proje henüz kişisel/dev aşamasında olduğu için gerçek bir e-posta
    sağlayıcısı kurulana kadar mekanizma böyle test edilebiliyor. SMTP kimlik
    bilgileri elde edildiğinde sadece .env'e eklenmesi yeterli, kod tarafında
    değişiklik gerekmez (2026-08-03'te Gmail SMTP ile gerçek teslimat
    doğrulandı)."""
    if not settings.smtp_host:
        logger.info("[DEV MODU - e-posta gönderilmedi] %s (%s için): %s", subject, to_email, body)
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
    _send_email(
        to_email,
        "PulseCoach - Şifre Sıfırlama",
        "Şifreni sıfırlamak için aşağıdaki linke tıkla (1 saat geçerli):\n\n"
        f"{reset_link}\n\n"
        "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin.",
    )


def send_checkin_email(to_email: str, message: str) -> None:
    """Haftalık proaktif check-in mesajını e-posta olarak da gönderir -
    öncesinde check-in'ler SADECE uygulama içinde ("Check-in Mesajları"
    sekmesi) görünüyordu, kullanıcı o gün uygulamayı açmazsa kaçırıyordu."""
    _send_email(to_email, "PulseCoach - Haftalık Check-in", message)
