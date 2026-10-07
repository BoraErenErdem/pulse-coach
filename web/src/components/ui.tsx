import { useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { CheckCircle2, ChevronDown, ChevronUp, PartyPopper, Plus, Sparkles, Trash2 } from "lucide-react";
import { exerciseDisplayName, useLanguage, useT } from "@/lib/language-context";
import type { ExerciseGoalProgress } from "@/lib/api";
import { PulseMark } from "@/components/PulseMark";
import { tileStyle, type TileIdentityKey } from "@/lib/identity";

/** Bölüm paneli - mobil ProgressSectionCard (2026-10-07): açıkta beyaz .82 + şeftali gölge,
 * koyuda sayfa tonunun sıcak rampası (bkz. globals.css .pc-panel). */
export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`pc-panel p-5 sm:p-6 ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300 ${className}`}
      {...props}
    />
  );
}

const FIELD_CLASSNAME =
  "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-[var(--tone-accent)] focus:ring-1 focus:ring-[var(--tone-accent)] dark:text-zinc-100";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSNAME} ${className}`} {...props} />;
}

// KVKK açık rıza checkbox'ları (register, 2026-09-11) için eklendi - `label`
// yerine `children` alıyor çünkü rıza metinleri neredeyse her zaman içine
// bir link barındırıyor (ör. "[Aydınlatma Metni]'ni okudum..."), düz string
// prop bunu ifade edemezdi. `items-start` + `mt-0.5`: çok satırlı rıza
// metniyle checkbox'ın üst kenarı hizalı kalsın diye (items-center'da metin
// 2 satıra düşünce checkbox ortada garip kalıyordu).
export function Checkbox({
  id,
  checked,
  onChange,
  children,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--border-strong)] accent-[var(--tone-fill)]"
      />
      <span>{children}</span>
    </label>
  );
}

export function Select({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_CLASSNAME} ${className}`} {...props} />;
}

export function PrimaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--tone-fill)] px-5 py-2 text-sm font-semibold text-[var(--tone-on-fill)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-95 hover:shadow-lg active:translate-y-0 active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100 ${className}`}
      {...props}
    />
  );
}

export function SecondaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] hover:shadow-md active:translate-y-0 active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100 dark:text-zinc-200 ${className}`}
      {...props}
    />
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="animate-fade-in-up rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    // Mobil dil: palet dışı mavi yerine sayfa tonunda sakin bilgi kutusu (2026-10-07).
    <div className="animate-fade-in-up rounded-2xl border border-[color-mix(in_srgb,var(--tone-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--tone-accent)_9%,transparent)] px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
      {message}
    </div>
  );
}

/** Öne çıkan, sıcak vurgu renkli özet/içgörü kartı — düz InfoBanner'dan
 * farklı olarak bir başlık + ikon taşır, haftalık/günlük özet metni gibi
 * "bunu oku" denen tek bir içerik için kullanılır. */
export function InsightCard({ title, message }: { title: string; message: string }) {
  // Mobil ProgressInsight: sayfa tonunda koç kartı (koyuda tonun gradyanı, açıkta tonlu dolgu).
  return (
    <div className="pc-insight animate-fade-in-up p-[18px]">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        {title}
      </h3>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed opacity-95">{message}</p>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="animate-fade-in-up flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
      <CheckCircle2 className="animate-pop-in h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin-slow ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Sayfalar arası tutarlı boş-durum gösterimi (ör. "henüz kayıt yok") —
 * checkins sayfasındaki ikon+açıklama deseninin paylaşılan hali. */
export function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-zinc-300 dark:text-zinc-700">{icon}</span>
      <p className="max-w-xs text-sm text-zinc-500">{message}</p>
    </div>
  );
}

/** Genel yükleme göstergesi — jenerik döner yerine PulseCoach'ın imza
 * motifi (bkz. PulseMark.tsx) sonsuz döngüde "kendini çiziyor". */
export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-sm text-zinc-500">
      <span className="text-[var(--tone-accent)]">
        <PulseMark size={44} animated loop />
      </span>
      <span>{label ?? t("Yükleniyor...", "Loading...")}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--surface-muted)] ${className}`} />;
}

/** Değerin başındaki sayıyı (varsa) 0'dan hedefe kısa bir sayaç animasyonuyla
 * doldurur, geri kalan metni (birim/etiket) olduğu gibi bırakır — ör.
 * "78.5 kg" -> "0 kg"'dan başlayıp "78.5 kg"'a dolar, "—" ya da "3 hafta"
 * gibi baştan sayısal olmayan değerlerde animasyon atlanır (WHOOP'un "tek
 * rakamı vurgula" prensibinin küçük bir dokunuşu, bkz. redesign planı). */
function useCountUpValue(value: string, durationMs = 550): string {
  const match = value.match(/^-?\d+(?:[.,]\d+)?/);
  const [animated, setAnimated] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return undefined;
    const target = Number(match[0].replace(",", "."));
    const suffix = value.slice(match[0].length);
    const decimals = match[0].includes(".") || match[0].includes(",") ? 1 : 0;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) * (1 - progress); // ease-out
      const current = target * eased;
      setAnimated(`${current.toFixed(decimals)}${suffix}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!match) return value;
  return animated ?? `${match[0].includes(".") || match[0].includes(",") ? "0.0" : "0"}${value.slice(match[0].length)}`;
}

/** Besin değeri → seri değişkeni ("--series-N") eşlemesi -
 * mobile/components/ui.tsx::buildNutrientColors'ın web portu (2026-08-24,
 * "web'i mobille hizala" kullanıcı kararı). ÖNCEDEN Beslenme sekmesindeki
 * İstatistik Kutuları/Günlük Hedef ölçerleri/MacroDistributionChart üçü de
 * KENDİ hardcoded seriesVar/renk sabitini taşıyordu, birbirinden habersiz -
 * ör. Sodyum kutuda `--series-4`, grafikte `--series-6` idi. Artık üçü de bu
 * TEK kaynaktan besleniyor. Sadece 6 seri var ama 8 kavram olduğu için 2
 * çift AYNI seriyi paylaşıyor - bu KASITLI (mobildeki AYNI not): Şeker
 * sadece grafikte var (Kalori orada YOK, çakışmaz), Kayıt sadece kutularda
 * var (Yağ kutularda YOK, çakışmaz) - hiçbir TEK ekranda/listede aynı renk
 * iki farklı kavram için yan yana görünmüyor. */
export type NutrientKey =
  | "kalori"
  | "protein"
  | "karbonhidrat"
  | "yağ"
  | "lif"
  | "sodyum"
  | "şeker"
  | "kayıt";

export const NUTRIENT_SERIES_VAR: Record<NutrientKey, string> = {
  kalori: "--series-1",
  protein: "--series-2",
  karbonhidrat: "--series-3",
  yağ: "--series-4",
  lif: "--series-5",
  sodyum: "--series-6",
  şeker: "--series-1",
  kayıt: "--series-4",
};

/** Grafiklerle aynı dataviz paletinden seri değişkeni ("--series-1" gibi) —
 * StatTile'ın rengini sayfadaki grafiklerle tutarlı tutar. Büyük rakam kalın
 * Inter (font-bold, tracking-tight) ile WHOOP-tarzı "tek bakışta oku" hissi
 * veriyor - Fraunces burada KULLANILMIYOR (2026-08-15, kullanıcı canlı
 * testte bu fontu beğenmedi; Fraunces sadece karşılama başlığında kalıyor). */
/** Birincil eylem kartı - mobil ProgressFormCard (2026-10-07): katlıyken tek satırlık
 * "+ başlık" çubuğu (sayfayı kısaltır), açılınca form. Kenarlık, parıltı ve "+" dairesi sayfa
 * tonunun dolgu renginde (İlerleme turuncu, Antrenman kırmızı, Beslenme zeytin...). */
export function FormCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="pc-panel pc-form p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-11 w-full items-center gap-3 text-left"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--tone-fill)] text-[var(--tone-on-fill)]">
          {open ? <ChevronUp className="h-[18px] w-[18px]" strokeWidth={2.6} /> : <Plus className="h-[18px] w-[18px]" strokeWidth={2.8} />}
        </span>
        <span className="flex-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
        {open ? null : <ChevronDown className="h-[18px] w-[18px] text-zinc-500" aria-hidden="true" />}
      </button>
      <div id={bodyId} hidden={!open} className="mt-4">
        {children}
      </div>
    </div>
  );
}

/** Cam istatistik kutusu - mobil ProgressTile (2026-10-07): koyuda kimlik gradyanı + beyaz
 * kenarlık/parıltı, açıkta kimlik tonlu beyaz. Düzen mobildeki gibi: ikon+etiket, büyük değer
 * (30 Medium), alt yazı. Renk kimliği lib/identity.ts'ten. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  identity,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  identity: TileIdentityKey;
}) {
  const animatedValue = useCountUpValue(value);
  return (
    <div
      className="pc-tile flex min-h-[124px] flex-col justify-between p-[14px] transition-transform duration-200 ease-out hover:-translate-y-0.5"
      style={tileStyle(identity)}
    >
      <div className="flex items-start gap-1.5 text-[var(--tile-text)]">
        {icon ? (
          <span className="mt-px flex shrink-0 text-[var(--tile-icon)] [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {/* Dar sütunda ("Son 7 Gün Antrenman") tek satıra sığmıyordu: en fazla 2 satır. */}
        <span className="line-clamp-2 text-xs font-medium leading-snug">{label}</span>
      </div>
      <p className="animate-stat-rise truncate text-[30px] font-medium leading-tight tracking-[-0.5px] text-[var(--tile-text)]">
        {animatedValue}
      </p>
      <p className="line-clamp-2 text-xs leading-snug text-[var(--tile-subtle)]">{hint ?? " "}</p>
    </div>
  );
}

/** Art arda kaç gün aktif olunduğunu gösteren nabız-noktası dizisi —
 * Noom'un check-mark streak fikrinin PulseCoach'ın nabız motifine uyarlanmış
 * hali (bkz. redesign planı). Var olan bir veriyi (ör. `streak_days`)
 * GÖRSEL olarak vurgular, yeni bir backend kavramı GEREKTİRMEZ - dolu nokta
 * sayısı `count`, üst sınır `max` (görsel taşmayı önlemek için). */
export function PulseStreak({
  count,
  max = 8,
  label,
}: {
  count: number;
  max?: number;
  label?: string;
}) {
  const dots = Math.min(count, max);
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              i < dots ? "animate-pop-in bg-[var(--tone-accent)]" : "bg-[var(--surface-muted)]"
            }`}
            style={i < dots ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        ))}
        {count > max ? <span className="ml-1 text-xs font-semibold text-[var(--tone-accent)]">+{count - max}</span> : null}
      </div>
      {label ? <span className="text-xs text-zinc-500">{label}</span> : null}
    </div>
  );
}

/** Tam sayı hedefler ("100 kg") gereksiz ".0" ile kalabalıklaşmasın, ama
 * ondalıklı bir hedef ("100.5 kg") de tam sayıya yuvarlanıp veri kaybı
 * izlenimi vermesin (kullanıcı bulgusu, mobil portta bulundu - egzersiz
 * hedefine "100,5" girince ilerleme çubuğunda "101" görünüyordu; kaydedilen
 * değer aslında değişmiyor, SADECE bu gösterim tam sayıya yuvarlıyordu). */
function formatMeterNumber(n: number | null): string {
  if (n == null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Bir hedefe göre ilerleme çubuğu (ör. günlük kalori/makro hedefi) — dataviz
 * skill'in "meter / progress track" bileşeni: aynı seri renginin tonu, sadece
 * dolu kısım için kullanılır. */
export function GoalMeter({
  label,
  value,
  goal,
  unit,
  seriesVar,
}: {
  label: string;
  value: number | null;
  goal: number | null;
  unit: string;
  seriesVar: string;
}) {
  const pct = goal != null && goal > 0 ? Math.min(100, ((value ?? 0) / goal) * 100) : 0;
  return (
    <div className="viz-root">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="text-zinc-500">
          {formatMeterNumber(value)} / {formatMeterNumber(goal)} {unit} (%{pct.toFixed(0)})
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: `var(${seriesVar})` }}
        />
      </div>
    </div>
  );
}

/** Egzersiz hedefi listesi (GoalMeter + ilerleme durumu) — goals/page.tsx ve
 * workouts/page.tsx'te neredeyse birebir aynı kopyayla vardı (2026-08-10
 * mimari borç raporu, bulgu #8). İki sayfa arasındaki tek gerçek fark: goals
 * sayfası silinebilir + %100'de ayrı bir kutlama metni gösterirken, workouts
 * sayfası salt-okunur (sadece küçük bir ikon) - `onDelete` prop'unun
 * varlığı/yokluğu bu iki görünümü tek bileşende ayırt eder. */
export function ExerciseGoalsList({
  goals,
  onDelete,
}: {
  goals: ExerciseGoalProgress[];
  onDelete?: (goalId: number) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="space-y-4">
      {goals.map((eg) => {
        const isDurationGoal = eg.target_duration_minutes != null;
        const name = exerciseDisplayName(eg, language);
        return (
        <div key={eg.id}>
          <div className={`flex items-center ${onDelete ? "gap-3" : "gap-2"}`}>
            <div className="flex-1 space-y-2">
              {isDurationGoal ? (
                <GoalMeter
                  label={name}
                  value={eg.best_duration_minutes}
                  goal={eg.target_duration_minutes}
                  unit={t("dk", "min")}
                  seriesVar="--series-3"
                />
              ) : (
                <>
                  <GoalMeter
                    label={name}
                    value={eg.best_weight_kg ?? 0}
                    goal={eg.target_weight_kg}
                    unit="kg"
                    seriesVar="--series-2"
                  />
                  {eg.target_reps != null ? (
                    <GoalMeter
                      // Tekrar yalnız hedef ağırlıkta sayılıyor (exercise_goal_service) - düz
                      // "Tekrar 0/10", 40 kg ile 10 tekrar yapana yanlış görünüyordu (canlı test 2026-10-06).
                      label={t(`${eg.target_weight_kg} kg ile tekrar`, `Reps at ${eg.target_weight_kg} kg`)}
                      value={eg.best_reps ?? 0}
                      goal={eg.target_reps}
                      unit={t("tekrar", "reps")}
                      seriesVar="--series-1"
                    />
                  ) : null}
                </>
              )}
            </div>
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(eg.id)}
                className="text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                aria-label={t("Hedefi sil", "Delete goal")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : eg.progress_pct >= 100 ? (
              <PartyPopper
                className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-label={t("Hedefe ulaşıldı", "Goal reached")}
              />
            ) : null}
          </div>
          {onDelete && eg.progress_pct >= 100 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <PartyPopper className="h-3.5 w-3.5" />
              {t(`Tebrikler, ${name} hedefine ulaştın!`, `Congrats, you've reached your ${name} goal!`)}
            </p>
          ) : null}
        </div>
        );
      })}
    </div>
  );
}

/** Debounce'lu arama kutulu autocomplete — egzersiz/besin kataloğu gibi
 * büyük listelerden seçim yapmak için native <select> yerine kullanılır. */
export function SearchableSelect<T>({
  onSearch,
  onSelect,
  getLabel,
  getKey,
  placeholder,
  selectedLabel,
  onQueryChange,
  id,
}: {
  onSearch: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  getLabel: (item: T) => string;
  getKey: (item: T) => string | number;
  placeholder?: string;
  selectedLabel?: string;
  /** Kullanıcı serbest metin yazdıkça (bir öneriye tıklamadan da) ham metni
   * üst bileşene bildirir — kataloğa zorunlu eşleşmeyen formlar (ör. serbest
   * egzersiz adı) için. */
  onQueryChange?: (value: string) => void;
  /** Görünen <Label htmlFor> ile eşleşsin diye (erişilebilir ad, canlı test 2026-10-06). */
  id?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  // ARIA combobox + klavye (canlı test 2026-10-06): öneri listesi rolsüz düz
  // butonlardı - ekran okuyucu listeyi duyuramıyor, ok tuşlarıyla seçilemiyordu.
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function syncSelectedLabel() {
      if (selectedLabel !== undefined) setQuery(selectedLabel);
    }
    syncSelectedLabel();
  }, [selectedLabel]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setIsOpen(true);
    setActiveIndex(-1);
    onQueryChange?.(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setIsSearching(true);
      onSearch(value)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
  }

  function handleSelect(item: T) {
    onSelect(item);
    setQuery(getLabel(item));
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  const isListOpen = isOpen && !isSearching && results.length > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!isListOpen) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + step + results.length) % results.length);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(results[activeIndex]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t("Ara...", "Search...")}
        className={FIELD_CLASSNAME}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isListOpen}
        aria-controls={listId}
        aria-activedescendant={isListOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      />
      {isOpen && (isSearching || results.length > 0) ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] py-1 shadow-lg">
          {isSearching ? (
            <div className="px-3 py-2 text-sm text-zinc-500">{t("Aranıyor...", "Searching...")}</div>
          ) : (
            <div role="listbox" id={listId}>
              {results.map((item, index) => (
                <div
                  key={getKey(item)}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  // mousedown: input blur'undan önce seçsin
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(item)}
                  className={`block w-full cursor-pointer px-3 py-2 text-left text-sm text-zinc-800 hover:bg-[var(--surface-muted)] dark:text-zinc-100 ${index === activeIndex ? "bg-[var(--surface-muted)]" : ""}`}
                >
                  {getLabel(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
