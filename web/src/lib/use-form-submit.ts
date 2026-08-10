"use client";

import { useCallback, useState } from "react";
import { ApiError } from "./api";
import { useT } from "./language-context";

// progress/workouts/nutrition/goals/profile sayfalarındaki form gönderim
// handler'larının HER BİRİ kendi içinde birebir aynı iskeleti (başarı/hata
// mesajlarını sıfırla + isSubmitting + try/catch/finally + ApiError kontrolü)
// tekrarlıyordu (2026-08-10 mimari borç raporu, bulgu #11). Sayfaya özgü
// doğrulama (ör. "kilo alanı boş olamaz") `submit()` çağrılmadan ÖNCE,
// `resetMessages()` ile birlikte çağıran tarafta kalır - hook sadece asıl
// gönderim adımının ortak iskeletini üstleniyor.
export function useFormSubmit(fallbackErrorMessage?: string): {
  isSubmitting: boolean;
  error: string | null;
  success: string | null;
  setError: (message: string | null) => void;
  setSuccess: (message: string | null) => void;
  resetMessages: () => void;
  submit: (action: () => Promise<void>) => Promise<void>;
} {
  const t = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const submit = useCallback(
    async (action: () => Promise<void>) => {
      resetMessages();
      setIsSubmitting(true);
      try {
        await action();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : (fallbackErrorMessage ?? t("Kaydedilemedi, tekrar dener misin?", "Couldn't save, want to try again?"))
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [t, fallbackErrorMessage, resetMessages]
  );

  return { isSubmitting, error, success, setError, setSuccess, resetMessages, submit };
}
