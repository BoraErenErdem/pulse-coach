import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "@/lib/language-context";
import { FormInput, type ThemeColors, useThemeColors } from "@/components/ui";

// web/src/components/ui.tsx'teki SearchableSelect'in mobil portu -
// debounce'lu arama kutulu autocomplete (egzersiz/besin kataloğu gibi büyük
// listelerden seçim). "Dışına dokununca kapat" ilk turda blur'un liste
// öğesine dokunmadan ÖNCE tetiklenip seçimi iptal edebileceği endişesiyle
// hiç eklenmemişti - canlı testte kullanıcı bunu eksik/rahatsız edici buldu.
// Standart çözüm uygulandı: blur'da hemen değil, kısa bir gecikmeyle kapat
// (dokunma onPress'i tetiklemeye yetecek kadar süre tanır), seçim/odaklanma
// gecikmeyi iptal eder.
// Redesign (Faz M2b, 2026-08-15): statik `colors` (+ sabit `#fff` açılır
// liste arkaplanı - koyu modda kırık duruyordu) yerine `useThemeColors()` -
// bu bileşen Antrenman/Beslenme/Hedefler'deki TÜM egzersiz/besin arama
// kutularının altyapısı, tek yerden düzeltme her yere yayılıyor.
const BLUR_CLOSE_DELAY_MS = 200;

export function SearchableSelect<T>({
  onSearch,
  onSelect,
  getLabel,
  getKey,
  placeholder,
  selectedLabel,
  onQueryChange,
}: {
  onSearch: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  getLabel: (item: T) => string;
  getKey: (item: T) => string | number;
  placeholder?: string;
  selectedLabel?: string;
  onQueryChange?: (value: string) => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedLabel !== undefined) setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function handleFocus() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (results.length > 0) setIsOpen(true);
  }

  function handleBlur() {
    blurTimeoutRef.current = setTimeout(() => setIsOpen(false), BLUR_CLOSE_DELAY_MS);
  }

  function handleChange(value: string) {
    setQuery(value);
    onQueryChange?.(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setIsSearching(true);
      onSearch(value)
        .then((items) => {
          setResults(items);
          setIsOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
  }

  function handleSelect(item: T) {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    onSelect(item);
    setQuery(getLabel(item));
    setResults([]);
    setIsOpen(false);
  }

  return (
    <View>
      <FormInput
        value={query}
        onChangeText={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder ?? t("Ara...", "Search...")}
      />
      {isOpen && (isSearching || results.length > 0) ? (
        <View style={s.dropdown}>
          {isSearching ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            results.map((item) => (
              <Pressable
                key={getKey(item)}
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [s.option, pressed && { backgroundColor: c.surfaceMuted }]}
              >
                <Text style={s.optionText}>{getLabel(item)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    dropdown: {
      marginTop: 4,
      maxHeight: 200,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.surface,
      overflow: "hidden",
    },
    loadingRow: {
      padding: 12,
      alignItems: "center",
    },
    option: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.surfaceMuted,
    },
    optionText: {
      fontSize: 14,
      color: c.text,
    },
  });
}
