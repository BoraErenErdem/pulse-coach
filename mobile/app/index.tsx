import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Faz M0 milestone ekranı: sadece backend'in /health endpoint'ine
// ulaşılabildiğini kanıtlamak için var. Auth/navigasyon M1'de gelecek.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

type ConnectionState = "checking" | "ok" | "error";

export default function Index() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setState("checking");
    setErrorDetail(null);

    if (!API_BASE_URL) {
      setState("error");
      setErrorDetail(
        "EXPO_PUBLIC_API_BASE_URL tanımlı değil (mobile/.env dosyasını kontrol et)."
      );
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) {
        throw new Error(`Beklenmeyen durum kodu: ${response.status}`);
      }
      const data = (await response.json()) as { status?: string };
      if (data.status !== "ok") {
        throw new Error(`Beklenmeyen yanıt: ${JSON.stringify(data)}`);
      }
      setState("ok");
    } catch (err) {
      setState("error");
      setErrorDetail(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PulseCoach</Text>
      <Text style={styles.subtitle}>Backend bağlantı testi</Text>

      <View style={styles.statusBox}>
        {state === "checking" && (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>Bağlanıyor…</Text>
          </>
        )}
        {state === "ok" && (
          <Text style={[styles.statusText, styles.ok]}>
            ✅ Backend&apos;e bağlantı başarılı
          </Text>
        )}
        {state === "error" && (
          <>
            <Text style={[styles.statusText, styles.error]}>
              ❌ Bağlantı başarısız
            </Text>
            {errorDetail && <Text style={styles.detail}>{errorDetail}</Text>}
            <Text style={styles.hint}>
              Kontrol et: (1) backend `--host 0.0.0.0` ile çalışıyor mu, (2)
              telefon ve bilgisayar aynı Wi-Fi&apos;de mi, (3)
              mobile/.env&apos;deki IP güncel mi.
            </Text>
          </>
        )}
      </View>

      <Text style={styles.baseUrl}>{API_BASE_URL ?? "(tanımsız)"}</Text>

      <Pressable style={styles.button} onPress={checkHealth}>
        <Text style={styles.buttonText}>Yeniden dene</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  statusBox: {
    alignItems: "center",
    gap: 8,
    minHeight: 80,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  ok: {
    color: "#1a7f37",
  },
  error: {
    color: "#c0392b",
  },
  detail: {
    fontSize: 12,
    color: "#c0392b",
    textAlign: "center",
  },
  hint: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
  baseUrl: {
    fontSize: 12,
    color: "#999",
  },
  button: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#208AEF",
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
