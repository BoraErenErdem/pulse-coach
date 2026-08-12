"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUnreadCheckinCount } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const POLL_INTERVAL_MS = 60_000;

/** NavBar'daki Bildirimler (Bell) rozeti için okunmamış sayısını tutar -
 * getUnreadCheckinCount SALT-OKUNUR olduğu için (bkz. api.ts) burada
 * güvenle periyodik yoklanabilir. Rota değişiminde de tazelenir - kullanıcı
 * /checkins'i ziyaret edip geri dönünce rozet hemen sıfırlanmış görünsün diye. */
export function useUnreadCheckins(): number {
  const { token } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    function handleNoToken() {
      setCount(0);
    }
    if (!token) {
      handleNoToken();
      return;
    }

    let cancelled = false;
    function refresh() {
      getUnreadCheckinCount(token!)
        .then(({ count: nextCount }) => {
          if (!cancelled) setCount(nextCount);
        })
        .catch(() => {
          // Sessizce yut - rozet güncellenemezse deneyimi bozmaz, bir
          // sonraki poll/rota değişiminde tekrar denenir.
        });
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, pathname]);

  return count;
}
