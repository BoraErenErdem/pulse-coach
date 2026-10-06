import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_TAB_BAR_HEIGHT } from "@/components/nav-icons";
import { useThemeColors } from "@/components/ui";
import { tapLight } from "@/lib/haptics";
import { useT } from "@/lib/language-context";

// Kaydırarak silme onaysız ve geri alınamazdı - tam kaydırıp bırakmak bile siliyordu
// (canlı test 2026-10-06). Artık kayıt hemen gizlenir, ~5 sn "Geri al" bildirimi
// gösterilir; süre dolunca gerçek silme isteği gider. Uygulama bu arada kapanırsa
// silme HİÇ gönderilmez (kayıt yerinde kalır - güvenli taraf). Tek bekleyen silme:
// yenisi gelince önceki hemen uygulanır. Kökte durduğu için ekran değişse de tamamlanır.
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
    tapLight();
    take()?.undo();
  }, [take]);

  const value = useMemo(() => ({ scheduleDelete }), [scheduleDelete]);
  return (
    <UndoDeleteContext.Provider value={value}>
      {children}
      {pending ? <UndoToast message={pending.message} onUndo={undo} /> : null}
    </UndoDeleteContext.Provider>
  );
}

function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.toast, { bottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + 28, backgroundColor: c.text }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.message, { color: c.background }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable
        onPress={onUndo}
        hitSlop={8}
        style={styles.undo}
        accessibilityRole="button"
        accessibilityLabel={t("Silmeyi geri al", "Undo delete")}
      >
        <Text style={[styles.undoText, { color: c.accent }]}>{t("Geri al", "Undo")}</Text>
      </Pressable>
    </View>
  );
}

/** Listeden silmeyi geri alınabilir yapar: `remove` kaydı hemen gizler (`hiddenIds`
 * ile süzülür), süre dolunca `commit` çalışır; geri alınırsa ya da commit
 * başarısız olursa kayıt yeniden görünür. Her liste türü kendi örneğini kullanır
 * (ör. oturum ve set kimlikleri çakışmasın). */
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

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    minHeight: 52,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 100,
  },
  message: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  undo: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  undoText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
