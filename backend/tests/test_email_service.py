from unittest.mock import MagicMock, patch

from app.config import get_settings
from app.services import email_service


def test_send_password_reset_email_skips_smtp_when_not_configured(monkeypatch):
    monkeypatch.setattr(get_settings(), "smtp_host", None)

    with patch("app.services.email_service.smtplib.SMTP") as mock_smtp_cls:
        email_service.send_password_reset_email("user@example.com", "http://example.com/reset?token=abc")

    mock_smtp_cls.assert_not_called()


def test_send_password_reset_email_sends_via_smtp_when_configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "sender@example.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    mock_smtp_instance = MagicMock()
    with patch("app.services.email_service.smtplib.SMTP") as mock_smtp_cls:
        mock_smtp_cls.return_value.__enter__.return_value = mock_smtp_instance
        email_service.send_password_reset_email("user@example.com", "http://example.com/reset?token=abc")

    mock_smtp_cls.assert_called_once_with("smtp.example.com", 587)
    mock_smtp_instance.starttls.assert_called_once()
    mock_smtp_instance.login.assert_called_once_with("sender@example.com", "app-password")
    mock_smtp_instance.send_message.assert_called_once()

    sent_message = mock_smtp_instance.send_message.call_args[0][0]
    assert sent_message["To"] == "user@example.com"
    assert sent_message["From"] == "noreply@example.com"
    assert "http://example.com/reset?token=abc" in sent_message.get_content()


def test_send_password_reset_email_skips_login_when_credentials_missing(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    monkeypatch.setattr(settings, "smtp_from_email", "noreply@example.com")

    mock_smtp_instance = MagicMock()
    with patch("app.services.email_service.smtplib.SMTP") as mock_smtp_cls:
        mock_smtp_cls.return_value.__enter__.return_value = mock_smtp_instance
        email_service.send_password_reset_email("user@example.com", "http://example.com/reset?token=abc")

    mock_smtp_instance.login.assert_not_called()
    mock_smtp_instance.send_message.assert_called_once()
