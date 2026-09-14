from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# 2026-09-11 güvenlik taraması: e-posta HİÇBİR YERDE normalize edilmiyordu -
# "Ali@Ornek.com" ile "ali@ornek.com" veritabanında (User.email == ... eşit
# karşılaştırması) FARKLI hesaplar olarak kabul ediliyordu. Bunun iki somut
# sonucu vardı: (1) "bu e-posta zaten kayıtlı" kontrolü büyük/küçük harf
# değiştirilerek bypass edilebiliyordu - aynı gerçek posta kutusu için
# birden fazla hesap açılabiliyordu (KVKK rıza kaydı da bu hesaplar arasında
# bölünürdü); (2) DAHA CİDDİSİ - login'deki hesap-bazlı rate limit
# (rate_limit.MAX_ATTEMPTS=5, bkz. auth/router.py) e-postanın DÜZ metnini
# bucket anahtarı olarak kullanıyordu, yani bir saldırgan HER başarısız
# denemede e-postanın harf büyüklüğünü değiştirerek (Victim@x.com,
# VIctim@x.com, ...) bu kilitlenmeyi sonsuza kadar bypass edip tek bir
# hesaba karşı sınırsız şifre denemesi yapabilirdi (IP bazlı ayrı kilit hâlâ
# var ama farklı IP'lerden dağıtılan bir saldırıyı durdurmaz). Tek bir
# noktada (bu şema katmanı - register/login/forgot-password'ın ÜÇÜ de
# buradan geçiyor) küçük harfe çevirip baştaki/sondaki boşluğu kırpmak,
# downstream'deki HER karşılaştırmayı (get_by_email, rate limit bucket key)
# otomatik olarak tutarlı hale getiriyor.
def _normalize_email(value: str) -> str:
    return value.strip().lower()


# 2026-08-30 güvenlik denetimi: şifre alanlarının hiçbirinde üst sınır yoktu -
# bcrypt zaten ilk 72 bayttan sonrasını sessizce yok sayıyor (passlib bunu
# kendi uyarısıyla bildiriyor) ama üst sınırsız bir alan yine de her istekte
# (login DAHİL, her başarısız denemede tekrar tekrar) rastgele büyüklükte bir
# string'in ayrılıp bcrypt'e verilmesine izin veriyordu - gereksiz bir
# kaynak-tüketim yüzeyi. 128 gerçek hiçbir şifreyi kesmeyecek kadar bol.
_MAX_PASSWORD_LENGTH = 128


# 2026-09-11 KVKK uyumluluğu: sağlık verisi işleyen bir uygulama olarak
# register'da genel KVKK rızası + sağlık verisi özel rızası AYRI AYRI ZORUNLU
# (bkz. web/mobile'daki iki ayrı checkbox + /kvkk sayfası). 2026-09-14'te
# üçüncü bir zorunlu alan eklendi: terms_consent (bkz. /terms sayfası,
# özellikle tıbbi sorumluluk reddi maddesi) - KVKK rızalarından bilinçli
# olarak AYRI, çünkü farklı bir hukuki temele (sözleşme kabulü, kişisel veri
# işleme rızası değil) dayanıyor. Burada
# `bool = Field(...)` DEĞİL, çıplak `bool` kullanılıyor - varsayılan değer
# vermek (ör. `= False`) eski istemcilerin/bypass edilmiş isteklerin rızasız
# kayıt açmasına izin verir; alanın req body'de HİÇ olmaması da 422 vermeli.
# Ayrıca True olmayan bir değer (False dahil) reddedilir - checkbox'ları
# işaretlemeden "kayıt ol"a basmak İSTEMCİ tarafında zaten engelleniyor
# (bkz. login sayfaları), bu sadece savunma katmanı.
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(max_length=_MAX_PASSWORD_LENGTH)
    kvkk_consent: bool
    health_data_consent: bool
    terms_consent: bool

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

    @field_validator("password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Şifre en az 8 karakter olmalı.")
        return value

    @field_validator("kvkk_consent")
    @classmethod
    def kvkk_consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Aydınlatma Metni ve KVKK kapsamındaki açık rıza onaylanmadan kayıt olunamaz.")
        return value

    @field_validator("health_data_consent")
    @classmethod
    def health_data_consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Sağlık verilerinin işlenmesine açık rıza verilmeden kayıt olunamaz.")
        return value

    @field_validator("terms_consent")
    @classmethod
    def terms_consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Kullanım Koşulları kabul edilmeden kayıt olunamaz.")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=_MAX_PASSWORD_LENGTH)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime
    # Kayıttan önceki kullanıcılarda (bu alanlar eklenmeden önce açılmış
    # hesaplar) None - bkz. migration 1a2c9e7b3f4d.
    kvkk_consent_at: datetime | None = None
    health_data_consent_at: datetime | None = None
    terms_consent_at: datetime | None = None


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)


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
