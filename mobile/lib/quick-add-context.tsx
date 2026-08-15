import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Sohbet ekranının hızlı-ekle menüsünden (bkz. components/quick-add-menu.tsx)
 * hedef sekmenin BottomSheet'ini açmak için paylaşımlı sinyal - sekmeler
 * unmount OLMADIĞI için (bkz. proje belleği) doğrudan navigasyon TEK BAŞINA
 * yeterli değil, zaten mount olmuş workouts.tsx'in "sheet'i aç" demesi
 * gerekiyor. Sayaç deseni: her istek değeri ARTIRIYOR (bool yerine), aynı
 * ekrandayken art arda iki kez "Antrenman Ekle"ye basılsa bile useEffect
 * yine tetiklensin diye.
 */
interface QuickAddContextValue {
  workoutSheetRequestId: number;
  requestOpenWorkoutSheet: () => void;
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [workoutSheetRequestId, setWorkoutSheetRequestId] = useState(0);
  const value = useMemo(
    () => ({
      workoutSheetRequestId,
      requestOpenWorkoutSheet: () => setWorkoutSheetRequestId((n) => n + 1),
    }),
    [workoutSheetRequestId]
  );
  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider");
  return ctx;
}
