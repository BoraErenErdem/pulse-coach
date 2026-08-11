"use client";

import { searchExercises, type ExerciseCatalogItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { catalogDisplayName, useLanguage, useT } from "@/lib/language-context";
import { SearchableSelect } from "./ui";

// goals/page.tsx ve workouts/page.tsx'te BİREBİR AYNI SearchableSelect prop
// bloğuyla vardı (2026-08-10 mimari borç raporu, bulgu #12) - egzersiz
// kataloğunda arama yapıp seçilen ismi dile göre göstermek/kaydetmek için.
export function ExerciseSearchField({
  value,
  onChange,
  onSelectItem,
}: {
  value: string;
  onChange: (name: string) => void;
  // Kullanıcı listeden bir katalog kaydı SEÇTİĞİNDE (elle yazdığında değil)
  // çağrılır - katalog ID'sini bilmek isteyen çağıranlar (ör. antrenman
  // set kaydı) katalog eşlemesini isim metnine değil ID'ye dayandırabilsin
  // diye (isim metni dile göre değişiyor, ID değişmiyor - 2026-08-11
  // kullanıcı bulgusu: dil değiştirince hedef ilerlemesi kopuyordu).
  onSelectItem?: (item: ExerciseCatalogItem) => void;
}) {
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = useT();
  return (
    <SearchableSelect<ExerciseCatalogItem>
      selectedLabel={value}
      onQueryChange={onChange}
      onSearch={(query) => (token ? searchExercises(token, query) : Promise.resolve([]))}
      onSelect={(item) => {
        onChange(catalogDisplayName(item, language));
        onSelectItem?.(item);
      }}
      getLabel={(item) => catalogDisplayName(item, language)}
      getKey={(item) => item.id}
      placeholder={t("Egzersiz adı yaz...", "Type exercise name...")}
    />
  );
}
