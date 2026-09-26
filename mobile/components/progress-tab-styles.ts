// İlerleme sekmesi stilleri (2026-09-26, app/(tabs)/progress.tsx'ten taşındı - mantık aynı).
import { getFloatingTabBarClearance } from "@/components/nav-icons";
import { StyleSheet } from "react-native";
import type { ThemeColors } from "@/components/ui";

export function makeStyles(c: ThemeColors, insetBottom: number, isDark: boolean) {
  const panelMuted = isDark ? "rgba(255,255,255,0.72)" : c.muted;
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      padding: 16,
      gap: 16,
      paddingBottom: 32 + getFloatingTabBarClearance(insetBottom),
    },
    // Fraunces SADECE büyük punto (bkz. redesign planı) - sayfa başlığı bu
    // kuralın dışında kalıyor (Inter'de kalıyor), sadece StatTile rakamları
    // ve karşılama metni Fraunces kullanıyor.
    // Mockup'ta başlık belirgin biçimde daha büyük ve daha hafif (Medium).
    title: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      color: c.text,
      marginBottom: 4,
    },
    streakValue: {
      fontSize: 30,
      fontFamily: "Inter_500Medium",
      letterSpacing: -0.5,
    },
    // Seri > 0: sayı 🔥 renginde ve parlak zeminde okunsun diye hafif alev
    // parıltısı/gölgesi.
    streakValueLit: {
      fontFamily: "Inter_700Bold",
      textShadowColor: "rgba(150,30,0,0.55)",
      textShadowRadius: 8,
      textShadowOffset: { width: 0, height: 1 },
    },
    // Kullanıcı bulgusu (2026-08-21, GERÇEK telefonda): `alignItems:
    // "flex-start"` ızgarayı komple bozdu (kutular üst üste bindi). O
    // düzeltildikten sonra 2026-08-22'de İKİNCİ bir gerçek-cihaz bulgusu:
    // satırdaki 2 kutu eşit genişlikte DEĞİLDİ (sağdaki belirgin şekilde
    // daha geniş). Denenen `flexBasis:"48%"` (+/- flexGrow) kombinasyonlarının
    // HİÇBİRİ güvenilir simetrik sonuç vermedi - biri native'de asimetrik,
    // diğeri web'de içeriğe sıkışma bug'ı yarattı (bkz. `statTileEqual`
    // notu). Artık ızgara TEK bir flexWrap konteyner DEĞİL, İKİ AÇIK dikey
    // satır (`statGridRows` içinde `statGridRow`) - her satırda TAM 2 kutu.
    statGridRows: {
      gap: 10,
    },
    statGridRow: {
      flexDirection: "row",
      gap: 10,
    },
    // Bir satırdaki 2 kutuyu KESİN 50/50 böler - `flexBasis:0` (percentage
    // DEĞİL, mutlak sıfır) + `flexGrow:1` ile her iki kutu da SIFIRDAN
    // büyüyüp aynı oranda genişliyor. `minWidth: 0` KRİTİK - onsuz her
    // kutunun örtük bir "min-content" tabanı kalıyor (flexbox varsayılanı),
    // Seri'nin nokta dizisi Kayıt'ın çıplak sayısından biraz daha geniş bir
    // taban istediği için ~30px'lik küçük ama gerçek bir asimetri kalıyordu
    // (canlı testte ölçüldü). `minWidth:0` bu tabanı sıfırlayıp SAF
    // flexGrow oranına (yani tam %50/%50) bırakıyor - içerik gerekirse
    // sarar, kutu asla büyümez.
    statTileEqual: {
      flexBasis: 0,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    row: {
      flexDirection: "row",
      gap: 10,
    },
    hintText: {
      fontSize: 12,
      color: panelMuted,
      lineHeight: 16,
    },
    groupLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: panelMuted,
      letterSpacing: 0.4,
    },
    // Satır zemini: koyuda yarı saydam beyaz (kahve panelin üstünde),
    // açıkta şeftali tonu - üstteki kutuların gölge/şeftali diliyle uyumlu.
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(245,162,107,0.10)",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    entryEditRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
    entryMetrics: { flexDirection: "row", alignItems: "center", gap: 20, flex: 1, flexWrap: "wrap" },
    entryMetric: { gap: 1 },
    entryValue: { fontSize: 15, fontFamily: "Inter_500Medium", color: c.text },
    entryCaption: { fontSize: 11, color: panelMuted },
    // Düzenle/sil/kaydet/iptal ikon butonları: önceden 15px ikon + hitSlop 8
    // (~31px) - 44pt minimumun altındaydı, hitSlop büyütmek de yan yana
    // duran butonların alanlarını ÇAKIŞTIRIRDI (yanlışlıkla sil). Sabit 44x44
    // kutu çakışmaz; negatif dikey marj satır yüksekliğini değiştirmez.
    iconRow: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: -10 },
    iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginVertical: -10 },
  });
}
