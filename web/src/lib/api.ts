import { getCurrentLanguage } from "@/lib/language-storage";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// api.ts düz bir modül (React hook'u yok) - Türkçe/İngilizce arasında
// karar vermek için useT() kullanamıyor. Bu iki mesaj (ağa hiç ulaşılamadı /
// gövde JSON değil-boş) backend'den DEĞİL doğrudan burada fırlatılıyor, bu
// yüzden dict[language] + language-storage.ts'in senkron aynası gerekiyor
// (2026-08-10 pürüz taraması, Tema C - önceden HER ZAMAN Türkçe'ydi, 11
// dosyada 30 yerde `err.message` doğrudan gösteriliyordu).
const _NETWORK_ERROR = {
  tr: "Backend'e ulaşılamıyor. Sunucu çalışıyor mu?",
  en: "Can't reach the backend. Is the server running?",
};
const _UNKNOWN_ERROR = {
  tr: "Bilinmeyen bir hata oluştu.",
  en: "An unknown error occurred.",
};
const _PHOTO_LOAD_FAILED = {
  tr: "Fotoğraf yüklenemedi.",
  en: "Failed to load photo.",
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// FastAPI, pydantic validasyon hatalarında (422) `detail`'i düz bir metin
// DEĞİL, {msg, loc, ...} nesnelerinden oluşan bir LİSTE olarak döner (ör.
// şifre/email kuralı ihlali). Eskiden sadece `typeof detail === "string"`
// kontrol edildiği için bu durumda genel "Bilinmeyen bir hata oluştu."
// mesajına düşülüyor, kullanıcı asıl sebebi (ör. "Şifre en az 8 karakter
// olmalı.") hiç göremiyordu.
function extractErrorDetail(data: unknown): string | null {
  if (data === null || typeof data !== "object" || !("detail" in data)) return null;
  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : null))
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(" ");
  }
  return null;
}

export interface UserRead {
  id: number;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const TOKEN_STORAGE_KEY = "pulsecoach_token";
export const REFRESH_TOKEN_STORAGE_KEY = "pulsecoach_refresh_token";

export interface ChatResponse {
  reply: string;
  agent_used: string;
}

export interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  agent_used: string | null;
  timestamp: string;
}

export const WORKOUT_TYPES = ["kuvvet", "kardiyo", "esneklik", "karışık"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export interface ProgressLog {
  id: number;
  weight: number | null;
  waist_cm: number | null;
  body_fat_pct: number | null;
  workout_completed: boolean;
  workout_type: string | null;
  log_date: string;
}

export interface ProgressLogPayload {
  weight?: number;
  waist_cm?: number;
  body_fat_pct?: number;
  workout_completed: boolean;
  workout_type?: WorkoutType;
}

export interface BodyCompositionInsight {
  message: string | null;
}

export interface ProgressLogUpdatePayload {
  weight?: number;
  waist_cm?: number;
  body_fat_pct?: number;
}

export interface WeeklySummary {
  log_count: number;
  workout_count: number;
  workout_types: Record<string, number>;
  weight_start: number | null;
  weight_end: number | null;
  weight_trend: number | null;
  streak_days: number;
  summary_text: string;
}

export interface WeeklyTrendPoint {
  week_start: string;
  avg_mood_score: number | null;
  mood_log_count: number;
  workout_days: number;
  avg_daily_calories: number | null;
  weight_end: number | null;
}

export interface Trends {
  points: WeeklyTrendPoint[];
  mood_workout_correlation: number | null;
}

export type CheckinKind = "weekly_summary" | "daily_nudge";

export interface CheckinMessage {
  id: number;
  kind: CheckinKind;
  message: string;
  generated_at: string;
  delivered: boolean;
}

export interface ExerciseCatalogItem {
  id: number;
  name_tr: string;
  name_en: string;
  category_tr: string;
  equipment_tr: string | null;
  primary_muscles_tr: string;
  secondary_muscles_tr: string | null;
  level_tr: string;
  instructions_tr: string | null;
}

// Kardiyo/esneklik süre bazlı giriş (2026-08-06) - bir set YA reps
// [+opsiyonel weight_kg] YA DA duration_minutes [+intensity+cardio_category]
// taşır (mutually exclusive, backend'de doğrulanıyor). Kalori tahmini
// backend'de MET yöntemiyle hesaplanıp estimated_calories'e yazılıyor -
// bkz. backend/app/services/met_reference.py.
export const CARDIO_CATEGORIES = [
  "kosu",
  "bisiklet",
  "yuruyus",
  "yuzme",
  "ip_atlama",
  "genel_kardiyo",
] as const;
export type CardioCategory = (typeof CARDIO_CATEGORIES)[number] | "esneklik";

export const CARDIO_CATEGORY_LABELS: Record<PreferredLanguage, Record<CardioCategory, string>> = {
  tr: {
    kosu: "Koşu",
    bisiklet: "Bisiklet",
    yuruyus: "Yürüyüş",
    yuzme: "Yüzme",
    ip_atlama: "İp Atlama",
    genel_kardiyo: "Genel Kardiyo",
    esneklik: "Esneklik",
  },
  en: {
    kosu: "Running",
    bisiklet: "Cycling",
    yuruyus: "Walking",
    yuzme: "Swimming",
    ip_atlama: "Jump Rope",
    genel_kardiyo: "General Cardio",
    esneklik: "Flexibility",
  },
};

export const INTENSITIES = ["hafif", "orta", "yogun"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const INTENSITY_LABELS: Record<PreferredLanguage, Record<Intensity, string>> = {
  tr: { hafif: "Hafif", orta: "Orta", yogun: "Yoğun" },
  en: { hafif: "Light", orta: "Moderate", yogun: "Intense" },
};

export interface WorkoutSetInput {
  exercise_name: string;
  reps?: number;
  weight_kg?: number;
  set_number?: number;
  exercise_catalog_id?: number;
  duration_minutes?: number;
  intensity?: Intensity;
  cardio_category?: CardioCategory;
}

export interface WorkoutSet {
  id: number;
  exercise_catalog_id: number | null;
  exercise_name_snapshot: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_minutes: number | null;
  intensity: Intensity | null;
  cardio_category: CardioCategory | null;
  estimated_calories: number | null;
  is_personal_record: boolean;
}

export interface WorkoutSession {
  id: number;
  session_date: string;
  workout_type: string | null;
  note: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutSessionPayload {
  session_date?: string;
  workout_type?: WorkoutType;
  note?: string;
  sets: WorkoutSetInput[];
}

export interface WorkoutSessionUpdatePayload {
  workout_type?: WorkoutType;
  note?: string;
}

export interface WorkoutSetUpdatePayload {
  reps?: number;
  weight_kg?: number;
  duration_minutes?: number;
  intensity?: Intensity;
  cardio_category?: CardioCategory;
}

export interface WorkoutSummary {
  session_count: number;
  total_sets: number;
  total_volume_kg: number;
  sets_by_exercise: Record<string, number>;
  summary_text: string;
  total_calories_burned: number;
}

// Egzersiz Geçmişi / Kendi-Kendine Kıyaslama (2026-08-13 kullanıcı isteği) -
// her egzersiz SADECE kendi geçmişiyle kıyaslanır, çapraz egzersiz kıyası YOK.
export interface LoggedExercise {
  exercise_name: string;
  exercise_catalog_id: number | null;
  set_count: number;
  last_logged: string;
}

export interface ExercisePeriodStat {
  period_start: string;
  period_end: string;
  top_weight_kg: number | null;
  top_weight_reps: number | null;
  total_sets: number;
  total_reps: number;
}

export interface ExerciseHistoryEntry {
  session_date: string;
  reps: number | null;
  weight_kg: number | null;
  is_personal_record: boolean;
}

export interface ExerciseHistory {
  exercise_name: string;
  entries: ExerciseHistoryEntry[];
  weekly: [ExercisePeriodStat, ExercisePeriodStat] | null;
  monthly: [ExercisePeriodStat, ExercisePeriodStat] | null;
}

export const MEAL_TYPES = ["kahvaltı", "öğle", "akşam", "atıştırmalık"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface FoodCatalogItem {
  id: number;
  name_tr: string;
  name_en: string;
  category_tr: string | null;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
}

export interface MealEntryPayload {
  food_catalog_id: number;
  quantity_grams: number;
  meal_type: MealType;
  log_date?: string;
}

export interface MealEntryUpdatePayload {
  quantity_grams?: number;
  meal_type?: MealType;
}

export interface MealEntry {
  id: number;
  food_catalog_id: number | null;
  food_name_snapshot: string;
  meal_type: string;
  quantity_grams: number;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  log_date: string;
}

export interface DailyNutritionSummary {
  entry_count: number;
  total_calories_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_sugar_g: number;
  total_sodium_mg: number;
  total_fiber_g: number;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  fat_goal_g: number | null;
  summary_text: string;
}

export const GOALS = ["weight_loss", "muscle_gain", "general_health"] as const;
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export type PreferredLanguage = "tr" | "en";

// "sicak" (sıcak/nazik) / "enerjik" (enerjik/takılan) / "notr" - push
// bildirim + haftalık/günlük check-in metinlerinin tonu, kullanıcının açık
// seçimi (backend'deki VALID_COACH_TONES ile aynı).
export const COACH_TONES = ["sicak", "enerjik", "notr"] as const;
export type CoachTone = (typeof COACH_TONES)[number];

export interface Profile {
  goal: Goal | null;
  activity_level: ActivityLevel | null;
  dietary_restrictions: string | null;
  target_weight_kg: number | null;
  daily_calorie_goal: number | null;
  daily_protein_goal_g: number | null;
  daily_carbs_goal_g: number | null;
  daily_fat_goal_g: number | null;
  preferred_language: PreferredLanguage;
  coach_tone: CoachTone | null;
}

export type ProfileUpdatePayload = Partial<Profile>;

export interface ExerciseGoalCreatePayload {
  exercise_name: string;
  target_weight_kg: number;
  exercise_catalog_id?: number;
}

export interface ExerciseGoalProgress {
  id: number;
  exercise_name: string;
  target_weight_kg: number;
  best_weight_kg: number | null;
  progress_pct: number;
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
}

// auth-context.tsx'te BAĞIMSIZ üç yerden (sayfa açılışında restoreSession,
// 20dk'lık proaktif interval, buradaki 401-retry) refresh tetiklenebiliyordu -
// backend refresh_token'ları tek-kullanımlık rotasyonla değiştirdiği ve
// zaten-rotasyonla-iptal-edilmiş bir token TEKRAR sunulursa (reuse detection)
// kullanıcının TÜM token'larını topluca iptal ettiği için, aynı ham token'la
// eşzamanlı iki `/auth/refresh` çağrısı (biri kazanır, diğeri "reuse" sayılır)
// kaybedeni SecureStore/localStorage'daki (kazananın az önce yazdığı GEÇERLİ)
// token'ları da silmeye götürüyordu - kullanıcı sonraki açılışta açıklanamayan
// bir oturum kopmasıyla karşılaşıyordu (2026-08-10 pürüz taraması, Tema D,
// canlı cihazda MoodPicker testi sırasında koddan tespit edildi).
// `refreshInFlight`: aynı anda gelen TÜM çağrılar AYNI promise'i bekler, ikinci
// bir ham-token sunumu hiç olmaz.
let refreshInFlight: Promise<string | null> | null = null;

/** access_token kısa ömürlü (30dk) — 401 alındığında, çağıran taraf hiçbir
 * şey bilmeden localStorage'daki refresh_token ile SESSİZCE bir kere
 * yenilenip istek tekrarlanır. `token` seçeneği geçilmemiş çağrılarda
 * (login/register/refresh'in kendisi) bu mantık hiç devreye girmez.
 * auth-context.tsx da (mount+proaktif interval) AYNI fonksiyonu çağırıyor -
 * yukarıdaki dedup sayesinde üç çağıran da tek bir gerçek istekte buluşuyor. */
export async function tryRefreshStoredAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    if (!storedRefreshToken) return null;
    try {
      const result = await apiFetch<TokenResponse>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: storedRefreshToken },
      });
      localStorage.setItem(TOKEN_STORAGE_KEY, result.access_token);
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, result.refresh_token);
      return result.access_token;
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}, isRetry = false): Promise<T> {
  const { method = "GET", body, token } = options;
  const language = getCurrentLanguage();
  const headers: Record<string, string> = { "X-Preferred-Language": language };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(_NETWORK_ERROR[language], 0);
  }

  if (!response.ok) {
    if (response.status === 401 && token && !isRetry) {
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        return apiFetch<T>(path, { ...options, token: freshToken }, true);
      }
    }

    let detail = _UNKNOWN_ERROR[language];
    try {
      const data = await response.json();
      detail = extractErrorDetail(data) ?? detail;
    } catch {
      // gövde JSON değil / boş — varsayılan mesaj kalır
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function register(email: string, password: string) {
  return apiFetch<UserRead>("/auth/register", {
    method: "POST",
    body: { email, password },
  });
}

export function login(email: string, password: string) {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function getMe(token: string) {
  return apiFetch<UserRead>("/users/me", { token });
}

export interface UserDataExport {
  user: { id: number; email: string; created_at: string };
  profile: Record<string, unknown> | null;
  progress_logs: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  checkin_messages: Record<string, unknown>[];
  meal_entries: Record<string, unknown>[];
  exercise_goals: Record<string, unknown>[];
  mood_logs: Record<string, unknown>[];
  workout_sessions: Record<string, unknown>[];
}

export function exportUserData(token: string) {
  return apiFetch<UserDataExport>("/users/me/export", { token });
}

export function deleteAccount(token: string, password: string) {
  return apiFetch<void>("/users/me", { method: "DELETE", body: { password }, token });
}

export function logoutRequest(refreshToken: string) {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

export function forgotPassword(email: string) {
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(token: string, newPassword: string) {
  return apiFetch<void>("/auth/reset-password", {
    method: "POST",
    body: { token, new_password: newPassword },
  });
}

export function getChatHistory(token: string) {
  return apiFetch<ConversationMessage[]>("/chat/history", { token });
}

export function sendChatMessage(token: string, message: string) {
  return apiFetch<ChatResponse>("/chat", {
    method: "POST",
    body: { message },
    token,
  });
}

export function logProgress(token: string, payload: ProgressLogPayload) {
  return apiFetch<ProgressLog>("/progress/log", {
    method: "POST",
    body: payload,
    token,
  });
}

export function getProgressLogs(
  token: string,
  days?: number,
  limit?: number,
  offset?: number,
  measurementsOnly?: boolean
) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  if (measurementsOnly) params.set("measurements_only", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ProgressLog[]>(`/progress/logs${query}`, { token });
}

export function updateProgressLog(token: string, logId: number, payload: ProgressLogUpdatePayload) {
  return apiFetch<ProgressLog>(`/progress/logs/${logId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteProgressLog(token: string, logId: number) {
  return apiFetch<undefined>(`/progress/logs/${logId}`, { method: "DELETE", token });
}

export function getWeeklySummary(token: string) {
  return apiFetch<WeeklySummary>("/progress/weekly-summary", { token });
}

export function getTrends(token: string, weeks = 12) {
  return apiFetch<Trends>(`/progress/trends?weeks=${weeks}`, { token });
}

export function getBodyCompositionInsight(token: string) {
  return apiFetch<BodyCompositionInsight>("/progress/body-composition-insight", { token });
}

export function getCheckins(token: string) {
  return apiFetch<CheckinMessage[]>("/checkins", { token });
}

export function getUnreadCheckinCount(token: string) {
  // getCheckins'in AKSİNE - hiçbir satırı okunmuş işaretlemez, NavBar
  // rozeti için güvenle sık sık çağrılabilir (bkz. backend
  // checkin_service.count_unread).
  return apiFetch<{ count: number }>("/checkins/unread-count", { token });
}

export function markAllCheckinsRead(token: string) {
  return apiFetch<undefined>("/checkins/mark-all-read", { method: "POST", token });
}

export function deleteCheckin(token: string, checkinId: number) {
  return apiFetch<undefined>(`/checkins/${checkinId}`, { method: "DELETE", token });
}

export function deleteAllCheckins(token: string) {
  return apiFetch<undefined>("/checkins", { method: "DELETE", token });
}

export function searchExercises(token: string, query: string) {
  return apiFetch<ExerciseCatalogItem[]>(`/workouts/exercises/search?q=${encodeURIComponent(query)}`, {
    token,
  });
}

export function logWorkoutSession(token: string, payload: WorkoutSessionPayload) {
  return apiFetch<WorkoutSession>("/workouts/sessions", { method: "POST", body: payload, token });
}

export function getWorkoutSessions(token: string, days?: number, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<WorkoutSession[]>(`/workouts/sessions${query}`, { token });
}

export function getWorkoutSummary(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiFetch<WorkoutSummary>(`/workouts/summary${query}`, { token });
}

export function getLoggedExercises(token: string, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<LoggedExercise[]>(`/workouts/exercises${query}`, { token });
}

export function getExerciseHistory(
  token: string,
  exerciseName: string,
  limit?: number,
  offset?: number
) {
  const params = new URLSearchParams({ exercise_name: exerciseName });
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  return apiFetch<ExerciseHistory>(`/workouts/exercises/history?${params.toString()}`, {
    token,
  });
}

export function getExerciseInsight(token: string, exerciseName: string, period: "weekly" | "monthly") {
  return apiFetch<{ message: string | null }>(
    `/workouts/exercises/insight?exercise_name=${encodeURIComponent(exerciseName)}&period=${period}`,
    { token }
  );
}

export function updateWorkoutSession(
  token: string,
  sessionId: number,
  payload: WorkoutSessionUpdatePayload
) {
  return apiFetch<WorkoutSession>(`/workouts/sessions/${sessionId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteWorkoutSession(token: string, sessionId: number) {
  return apiFetch<undefined>(`/workouts/sessions/${sessionId}`, { method: "DELETE", token });
}

export function updateWorkoutSet(
  token: string,
  sessionId: number,
  setId: number,
  payload: WorkoutSetUpdatePayload
) {
  return apiFetch<WorkoutSession>(`/workouts/sessions/${sessionId}/sets/${setId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteWorkoutSet(token: string, sessionId: number, setId: number) {
  return apiFetch<WorkoutSession>(`/workouts/sessions/${sessionId}/sets/${setId}`, {
    method: "DELETE",
    token,
  });
}

export function searchFoods(token: string, query: string) {
  return apiFetch<FoodCatalogItem[]>(`/nutrition/foods/search?q=${encodeURIComponent(query)}`, {
    token,
  });
}

export function logMealEntry(token: string, payload: MealEntryPayload) {
  return apiFetch<MealEntry>("/nutrition/entries", { method: "POST", body: payload, token });
}

export function getMealEntries(token: string, days?: number, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<MealEntry[]>(`/nutrition/entries${query}`, { token });
}

export function getDailyNutritionSummary(token: string) {
  return apiFetch<DailyNutritionSummary>("/nutrition/daily-summary", { token });
}

export function updateMealEntry(token: string, entryId: number, payload: MealEntryUpdatePayload) {
  return apiFetch<MealEntry>(`/nutrition/entries/${entryId}`, {
    method: "PATCH",
    body: payload,
    token,
  });
}

export function deleteMealEntry(token: string, entryId: number) {
  return apiFetch<undefined>(`/nutrition/entries/${entryId}`, { method: "DELETE", token });
}

export interface PhotoMealItem {
  food_name: string;
  estimated_grams: number;
  matched_food: FoodCatalogItem | null;
  candidates: FoodCatalogItem[];
  is_uncertain: boolean;
}

export interface PhotoMealAnalysis {
  items: PhotoMealItem[];
}

async function postPhotoForAnalysis(
  token: string,
  file: File,
  isRetry = false
): Promise<PhotoMealAnalysis> {
  const language = getCurrentLanguage();
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/nutrition/photo-analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Preferred-Language": language },
      body: formData,
    });
  } catch {
    throw new ApiError(_NETWORK_ERROR[language], 0);
  }

  if (!response.ok) {
    if (response.status === 401 && !isRetry) {
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        return postPhotoForAnalysis(freshToken, file, true);
      }
    }
    let detail = _UNKNOWN_ERROR[language];
    try {
      const data = await response.json();
      detail = extractErrorDetail(data) ?? detail;
    } catch {
      // gövde JSON değil / boş — varsayılan mesaj kalır
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as PhotoMealAnalysis;
}

export function analyzeMealPhoto(token: string, file: File) {
  return postPhotoForAnalysis(token, file);
}

export interface MealPhoto {
  id: number;
  detected_items_summary: string;
  created_at: string;
}

export function getPhotoHistory(token: string, limit = 30) {
  return apiFetch<MealPhoto[]>(`/nutrition/photo-history?limit=${limit}`, { token });
}

export function deletePhotoHistoryEntry(token: string, photoId: number) {
  return apiFetch<undefined>(`/nutrition/photo-history/${photoId}`, { method: "DELETE", token });
}

/** <img src> özel Authorization header'ı gönderemediği için görüntü baytları
 * elle fetch edilip Blob URL'e çevriliyor - postPhotoForAnalysis'teki aynı
 * 401-retry deseni burada da uygulanıyor. */
export async function getPhotoImageBlob(token: string, photoId: number, isRetry = false): Promise<Blob> {
  const language = getCurrentLanguage();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/nutrition/photo-history/${photoId}/image`, {
      headers: { Authorization: `Bearer ${token}`, "X-Preferred-Language": language },
    });
  } catch {
    throw new ApiError(_NETWORK_ERROR[language], 0);
  }

  if (!response.ok) {
    if (response.status === 401 && !isRetry) {
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        return getPhotoImageBlob(freshToken, photoId, true);
      }
    }
    throw new ApiError(_PHOTO_LOAD_FAILED[language], response.status);
  }

  return response.blob();
}

export function getProfile(token: string) {
  return apiFetch<Profile>("/profile", { token });
}

export function updateProfile(token: string, payload: ProfileUpdatePayload) {
  return apiFetch<Profile>("/profile", { method: "PATCH", body: payload, token });
}

export function getExerciseGoals(token: string) {
  return apiFetch<ExerciseGoalProgress[]>("/exercise-goals", { token });
}

export function setExerciseGoal(token: string, payload: ExerciseGoalCreatePayload) {
  return apiFetch<ExerciseGoalProgress>("/exercise-goals", { method: "POST", body: payload, token });
}

export function deleteExerciseGoal(token: string, goalId: number) {
  return apiFetch<undefined>(`/exercise-goals/${goalId}`, { method: "DELETE", token });
}

export const MOOD_KEYS = ["zor", "dusuk", "notr", "iyi", "harika"] as const;
export type MoodKey = (typeof MOOD_KEYS)[number];

export interface MoodLog {
  mood_key: MoodKey;
  log_date: string;
}

export function getTodayMood(token: string) {
  return apiFetch<MoodLog | null>("/mood/today", { token });
}

export function setTodayMood(token: string, moodKey: MoodKey) {
  return apiFetch<MoodLog>("/mood", { method: "POST", body: { mood_key: moodKey }, token });
}

export function deleteTodayMood(token: string) {
  return apiFetch<undefined>("/mood/today", { method: "DELETE", token });
}

export function getMoodHistory(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiFetch<MoodLog[]>(`/mood/history${query}`, { token });
}

export interface MoodInsight {
  message: string | null;
  // "insufficient_data" (henüz değerlendirilecek kadar veri yok - yer
  // tutucu göster) ile "no_signal" (yeterli veri var ama dikkat çekici bir
  // şey yok - sessiz kal) KARIŞTIRILMAMALI, bkz. backend trend_service.py.
  status: "ready" | "insufficient_data" | "no_signal";
}

export function getMoodInsight(token: string) {
  return apiFetch<MoodInsight>("/mood/insight", { token });
}

// Bilingual (2026-08-08, race condition fix'i): backend dil seçimi
// YAPMAZ, hem tr hem en döner - hangisinin gösterileceğine frontend
// `language` client state'ine göre karar verir (bkz. dailyTipText()).
// Böylece dil değiştirince PATCH /profile'ın commit olmasını beklemeye
// gerek kalmaz (eski tasarımda GET /daily-tip eski dili dönebiliyordu).
export interface DailyTip {
  tip_tr: string;
  tip_en: string;
  category_tr: string;
  category_en: string;
  icon: string;
}

export function getDailyTip(token: string) {
  return apiFetch<DailyTip>("/daily-tip", { token });
}

export function dailyTipText(tip: DailyTip, language: PreferredLanguage): { category: string; tip: string } {
  return language === "en"
    ? { category: tip.category_en, tip: tip.tip_en }
    : { category: tip.category_tr, tip: tip.tip_tr };
}
