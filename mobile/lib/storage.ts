import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store'un web tarafı eksik (`getValueWithKeyAsync` tanımsız) -
// Expo web'de uygulama İLK YÜKLEMEDE çöküyordu (2026-08-15 canlı Chrome
// testinde bulundu, redesign'dan BAĞIMSIZ önceden var olan bir sorun -
// mobil tarafı Expo web'den görsel doğrulamak isteyince ortaya çıktı).
// Bu sarmalayıcı native'de SecureStore'u DEĞİŞTİRMEDEN kullanır (güvenlik
// davranışı aynı kalır), SADECE web'de localStorage'a düşer - localStorage
// şifreli DEĞİL ama web zaten sadece geliştirme/test amaçlı kullanılıyor
// (bu bir React Native uygulaması, prod dağıtım hedefi native), tarayıcının
// kendisi de OS-seviyeli bir "secure storage" sunmuyor. SecureStore ile
// AYNI async imzayı (getItemAsync/setItemAsync/deleteItemAsync) koruyarak
// tüm çağıran dosyalarda (auth/language/theme/notifications-context, api.ts)
// TEK SATIRLIK import değişikliği dışında hiçbir değişiklik gerektirmiyor.
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(key, value);
    } catch {
      // web'de gizli sekme/kota aşımı gibi durumlarda sessizce yoksay -
      // native'deki SecureStore çağrıları zaten try/catch'siz aynı şekilde
      // çağrılıyor, burada da davranışı bozmuyoruz.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(key);
    } catch {
      // yoksay - bkz. setItemAsync
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
