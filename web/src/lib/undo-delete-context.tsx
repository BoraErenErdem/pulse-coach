"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/language-context";

// mobile/lib/undo-delete-context.tsx'in web karşılığı (canlı test 2026-10-13): web'de çöp
// kutusuna tek tık kaydı onaysız ve geri alınamaz siliyordu. Artık kayıt hemen gizlenir, ~5 sn
// "Geri al" bildirimi gösterilir; süre dolunca gerçek silme isteği gider. Sekme bu arada
// kapanırsa silme HİÇ gönderilmez (kayıt yerinde kalır - güvenli taraf). Tek bekleyen silme:
// yenisi gelince önceki hemen uygulanır. (app) düzeninde durduğu için sayfa değişse de tamamlanır.
const UNDO_WINDOW_MS = 5000;

interface PendingDelete {
  message: string;
  commit: () => Promise<void>;
  undo: () => void;
}

interface UndoDeleteContextValue {
  scheduleDelete: (item: PendingDelete) => void;
}

const UndoDeleteContext = createContext<UndoDeleteContextValue | null>(null);

export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const pendingRef = useRef<PendingDelete | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const take = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    return current;
  }, []);

  const commitPending = useCallback(() => {
    void take()?.commit();
  }, [take]);

  const scheduleDelete = useCallback(
    (item: PendingDelete) => {
      commitPending();
      pendingRef.current = item;
      setPending(item);
      timer.current = setTimeout(commitPending, UNDO_WINDOW_MS);
    },
    [commitPending]
  );

  const undo = useCallback(() => {
    take()?.undo();
  }, [take]);

  const value = useMemo(() => ({ scheduleDelete }), [scheduleDelete]);
  return (
    <UndoDeleteContext.Provider value={value}>
      {children}
      {/* Telefonda alt sekme çubuğunun (60px + 12px) üstünde. */}
      {pending ? (
        <div
          role="status"
          aria-live="polite"
          className="animate-fade-in-up fixed inset-x-4 bottom-[88px] z-40 mx-auto flex min-h-[52px] max-w-md items-center gap-3 rounded-2xl bg-zinc-900 pl-4 pr-2 text-white shadow-[0_4px_16px_rgba(0,0,0,0.25)] lg:bottom-6 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="min-w-0 flex-1 text-sm font-medium">{pending.message}</span>
          <button
            type="button"
            onClick={undo}
            aria-label={t("Silmeyi geri al", "Undo delete")}
            className="min-h-11 min-w-16 shrink-0 rounded-xl px-3 text-sm font-bold text-[#ff9a6c] hover:bg-white/10 dark:text-[#b8481f] dark:hover:bg-black/5"
          >
            {t("Geri al", "Undo")}
          </button>
        </div>
      ) : null}
    </UndoDeleteContext.Provider>
  );
}

/** Listeden silmeyi geri alınabilir yapar: `remove` kaydı hemen gizler (`hiddenIds` ile
 * süzülür), süre dolunca `commit` çalışır; geri alınırsa ya da commit başarısız olursa kayıt
 * yeniden görünür. Her liste türü kendi örneğini kullanır (ör. oturum ve set kimlikleri
 * çakışmasın). */
export function useUndoableDelete() {
  const ctx = useContext(UndoDeleteContext);
  if (!ctx) {
    throw new Error("useUndoableDelete must be used within an UndoDeleteProvider");
  }
  const { scheduleDelete } = ctx;
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set());
  const remove = useCallback(
    (id: number, message: string, commit: () => Promise<void>, onError: (err: unknown) => void) => {
      setHiddenIds((prev) => new Set(prev).add(id));
      const unhide = () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      scheduleDelete({
        message,
        commit: async () => {
          try {
            await commit();
          } catch (err) {
            onError(err);
          } finally {
            unhide();
          }
        },
        undo: unhide,
      });
    },
    [scheduleDelete]
  );
  return { hiddenIds, remove };
}
