from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# 2026-08-30 güvenlik denetimi: şifre alanlarının hiçbirinde üst sınır yoktu -
# bcrypt zaten ilk 72 bayttan sonrasını sessizce yok sayıyor (passlib bunu
# kendi uyarısıyla bildiriyor) ama üst sınırsız bir alan yine de her istekte
# (login DAHİL, her başarısız denemede tekrar tekrar) rastgele büyüklükte bir
# string'in ayrılıp bcrypt'e verilmesine izin veriyordu - gereksiz bir
# kaynak-tüketim yüzeyi. 128 gerçek hiçbir şifreyi kesmeyecek kadar bol.
_MAX_PASSWORD_LENGTH = 128


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(max_length=_MAX_PASSWORD_LENGTH)

    @field_validator("password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Şifre en az 8 karakter olmalı.")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=_MAX_PASSWORD_LENGTH)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class DeleteAccountRequest(BaseModel):
    password: str = Field(max_length=_MAX_PASSWORD_LENGTH)


class PushTokenUpdate(BaseModel):
    # None = bildirimleri kapat (cihaz kaydını sunucudan temizle).
    expo_push_token: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(max_length=_MAX_PASSWORD_LENGTH)

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Şifre en az 8 karakter olmalı.")
        return value
