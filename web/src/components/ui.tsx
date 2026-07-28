import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { CheckCircle2 } from "lucide-react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
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

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 ${className}`}
      {...props}
    />
  );
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-zinc-50 hover:shadow-md active:translate-y-0 active:scale-[0.97] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 ${className}`}
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
  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
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
    <div className="viz-root rounded-xl border border-zinc-200 bg-white p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
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
