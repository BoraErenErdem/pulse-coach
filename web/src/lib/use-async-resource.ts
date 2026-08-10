"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";
import { ApiError } from "./api";
import { useT } from "./language-context";

// goals/progress/workouts/mood/nutrition sayfalarının HER BİRİ kendi
// loadData'sında birebir aynı iskeleti (isLoading/error state + try/catch/
// finally + ApiError kontrolü + mount'ta/dep değişiminde otomatik çalıştırma)
// tekrarlıyordu (2026-08-10 mimari borç raporu, bulgu #10). `fetcher` kendi
// setState çağrılarını yapmaya devam eder (sayfa başına veri şekli farklı -
// tek bir alan veya Promise.all ile birden fazla alan olabilir), bu hook
// sadece o ortak iskeleti üstleniyor.
export function useAsyncResource(
  fetcher: () => Promise<void>,
  deps: DependencyList
): { isLoading: boolean; error: string | null; refresh: () => Promise<void> } {
  const t = useT();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await fetcher();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Veriler yüklenemedi.", "Couldn't load data."));
    } finally {
      setIsLoading(false);
    }
    // `deps` çağıran sayfa tarafından belirleniyor (ör. [token]) - fetcher
    // her render'da yeniden oluşturulsa da içeriği deps'e göre stabil. Genel
    // amaçlı bir hook olduğu için deps burada literal bir dizi OLAMAZ -
    // react-hooks eklentisinin hem exhaustive-deps hem useMemo/useCallback
    // literal-dizi kontrolü bu satırda kasıtlı olarak devre dışı.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);

  useEffect(() => {
    function load() {
      refresh();
    }
    load();
  }, [refresh]);

  return { isLoading, error, refresh };
}
