import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import type { ReactNode } from "react";

// Faz M1 için minimal/işlevsel ortak UI parçaları — web'deki
// `web/src/components/ui.tsx`'in kavramsal (piksel-eşit değil) karşılığı.
// Kapsamlı görsel tasarım kullanıcının 3. adımına (web+mobil frontend
// redesign turu) bırakıldı, bu bilinçli bir kapsam kararı.

export const colors = {
  accent: "#208AEF",
  error: "#c0392b",
  errorBg: "#fdecea",
  success: "#1a7f37",
  successBg: "#eaf6ec",
  text: "#1a1a1a",
  muted: "#666",
  border: "#e2e2e2",
  surfaceMuted: "#f4f4f5",
};

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.errorBg }]}>
      <Text style={{ color: colors.error, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
      <Text style={{ color: colors.success, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function FormInput(props: TextInputProps) {
  return <TextInput placeholderTextColor="#9ca3af" {...props} style={[styles.input, props.style]} />;
}

export function PrimaryButton({
  children,
  onPress,
  disabled,
  loading,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        (disabled || pressed) && { opacity: 0.7 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" style={{ marginRight: 8 }} /> : null}
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  banner: {
    borderRadius: 8,
    padding: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#fff",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
