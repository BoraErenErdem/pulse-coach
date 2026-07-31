import logging
import smtplib
from email.message import EmailMessage
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """SMTP ayarlanmışsa (settings.smtp_host) gerçek e-posta gönderir.
    Ayarlanmamışsa (dev/test ortamı varsayılanı) linki sadece log'a yazar -
    proje henüz tek kullanıcılı/dev aşamasında olduğu için gerçek bir e-posta
    sağlayıcısı kurulana kadar mekanizma böyle test edilebiliyor. SMTP
    kimlik bilgileri elde edildiğinde sadece .env'e eklenmesi yeterli,
    kod tarafında değişiklik gerekmez."""
    if not settings.smtp_host:
        logger.info(
            "[DEV MODU - e-posta gönderilmedi] Şifre sıfırlama linki (%s için): %s",
            to_email,
            reset_link,
        )
        return

    message = EmailMessage()
    message["Subject"] = "PulseCoach - Şifre Sıfırlama"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        "Şifreni sıfırlamak için aşağıdaki linke tıkla (1 saat geçerli):\n\n"
        f"{reset_link}\n\n"
        "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
