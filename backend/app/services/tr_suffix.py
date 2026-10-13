"""Sayıya gelen Türkçe ek, sayının OKUNUŞUNA göre ünlü uyumuna girer.

Canlı test 2026-10-13: beslenme özeti her yüzdeye "'i" ekliyordu ("%16'i",
doğrusu "%16'sı"; "%59'i" -> "%59'u")."""

# Son rakama göre iyelik eki: bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz.
_BY_LAST_DIGIT = {1: "i", 2: "si", 3: "ü", 4: "ü", 5: "i", 6: "sı", 7: "si", 8: "i", 9: "u"}
# Son rakam 0 ise onlar basamağına göre: on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan.
_BY_TENS = {1: "u", 2: "si", 3: "u", 4: "ı", 5: "si", 6: "ı", 7: "i", 8: "i", 9: "ı"}


def possessive_suffix(number: int) -> str:
    """Tam sayının iyelik eki ("hedefin %N'si" kalıbındaki ek): 16 -> "sı", 28 -> "i"."""
    number = abs(number)
    if number == 0:
        return "ı"  # sıfır
    if number % 10:
        return _BY_LAST_DIGIT[number % 10]
    if number % 100:
        return _BY_TENS[number % 100 // 10]
    if number % 1000:
        return "ü"  # yüz
    return "i"  # bin


def percent_possessive(value: float) -> str:
    """Yüzdeyi ekiyle yazar: 16.4 -> "%16'sı"."""
    rounded = round(value)
    return f"%{rounded}'{possessive_suffix(rounded)}"
