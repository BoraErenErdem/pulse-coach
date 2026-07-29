import { useEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-7 shadow-sm ${className}`}
      {...props}
    />
  );
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
  "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-input)] px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent dark:text-zinc-100";

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_CLASSNAME} ${className}`} {...props} />;
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/25 active:translate-y-0 active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100 ${className}`}
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] hover:shadow-md active:translate-y-0 active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100 dark:text-zinc-200 ${className}`}
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
    <div className="animate-fade-in-up rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
      {message}
    </div>
  );
}

/** Öne çıkan, sıcak vurgu renkli özet/içgörü kartı — düz InfoBanner'dan
 * farklı olarak bir başlık + ikon taşır, haftalık/günlük özet metni gibi
 * "bunu oku" denen tek bir içerik için kullanılır. */
export function InsightCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="animate-fade-in-up rounded-xl border border-accent-warm/25 bg-accent-warm/10 p-5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-warm/15 text-accent-warm">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      </div>
      <p className="whitespace-pre-wrap pl-9 text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
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

export function LoadingState({ label = "Yükleniyor..." }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-zinc-500">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--surface-muted)] ${className}`} />;
}

/** Grafiklerle aynı dataviz paletinden seri değişkeni ("--series-1" gibi) —
 * StatTile'ın rengini sayfadaki grafiklerle tutarlı tutar. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  seriesVar,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  seriesVar?: string;
}) {
  const accentStyle = seriesVar
    ? ({
        color: `var(${seriesVar})`,
        backgroundColor: `color-mix(in srgb, var(${seriesVar}) 14%, transparent)`,
      } as const)
    : undefined;

  return (
    <div className="viz-root rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{label}</span>
        {icon ? (
          <span
            className={
              seriesVar
                ? "flex h-7 w-7 items-center justify-center rounded-lg"
                : "text-zinc-400 dark:text-zinc-500"
            }
            style={accentStyle}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
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
  value: number;
  goal: number;
  unit: string;
  seriesVar: string;
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="viz-root">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="text-zinc-500">
          {value.toFixed(0)} / {goal.toFixed(0)} {unit} (%{pct.toFixed(0)})
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

/** Debounce'lu arama kutulu autocomplete — egzersiz/besin kataloğu gibi
 * büyük listelerden seçim yapmak için native <select> yerine kullanılır. */
export function SearchableSelect<T>({
  onSearch,
  onSelect,
  getLabel,
  getKey,
  placeholder = "Ara...",
  selectedLabel,
  onQueryChange,
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
}) {
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
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
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={FIELD_CLASSNAME}
      />
      {isOpen && (isSearching || results.length > 0) ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] py-1 shadow-lg">
          {isSearching ? (
            <div className="px-3 py-2 text-sm text-zinc-500">Aranıyor...</div>
          ) : (
            results.map((item) => (
              <button
                type="button"
                key={getKey(item)}
                onClick={() => handleSelect(item)}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-[var(--surface-muted)] dark:text-zinc-100"
              >
                {getLabel(item)}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
