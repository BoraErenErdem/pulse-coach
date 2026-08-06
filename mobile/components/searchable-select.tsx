import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FormInput, colors } from "@/components/ui";

// web/src/components/ui.tsx'teki SearchableSelect'in mobil portu -
// debounce'lu arama kutulu autocomplete (egzersiz/besin kataloğu gibi büyük
// listelerden seçim). RN'de "dışına tıklayınca kapat" web kadar doğal değil
// (blur, liste öğesine dokunmadan ÖNCE tetiklenip seçimi iptal edebiliyor) -
// bu yüzden dropdown sadece seçim yapılınca ya da sorgu 2 karakterin altına
// düşünce kapanıyor, blur'a bağlı değil (bilinçli basitleştirme).
export function SearchableSelect<T>({
  onSearch,
  onSelect,
  getLabel,
  getKey,
  placeholder = "Ara...",
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
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedLabel !== undefined) setQuery(selectedLabel);
  }, [selectedLabel]);

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
    onSelect(item);
    setQuery(getLabel(item));
    setResults([]);
    setIsOpen(false);
  }

  return (
    <View>
      <FormInput value={query} onChangeText={handleChange} placeholder={placeholder} />
      {isOpen && (isSearching || results.length > 0) ? (
        <View style={styles.dropdown}>
          {isSearching ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            results.map((item) => (
              <Pressable
                key={getKey(item)}
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceMuted }]}
              >
                <Text style={styles.optionText}>{getLabel(item)}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
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
    borderBottomColor: colors.surfaceMuted,
  },
  optionText: {
    fontSize: 14,
    color: colors.text,
  },
});
