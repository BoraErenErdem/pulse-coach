const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
  workout_completed: boolean;
  workout_type: string | null;
  log_date: string;
}

export interface ProgressLogPayload {
  weight?: number;
  workout_completed: boolean;
  workout_type?: WorkoutType;
}

export interface WeeklySummary {
  log_count: number;
  workout_count: number;
  workout_types: Record<string, number>;
  weight_start: number | null;
  weight_end: number | null;
  weight_trend: number | null;
  summary_text: string;
}

export interface CheckinMessage {
  id: number;
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

export interface WorkoutSetInput {
  exercise_name: string;
  reps: number;
  weight_kg?: number;
  set_number?: number;
  exercise_catalog_id?: number;
}

export interface WorkoutSet {
  id: number;
  exercise_catalog_id: number | null;
  exercise_name_snapshot: string;
  set_number: number;
  reps: number;
  weight_kg: number | null;
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
}

export interface WorkoutSummary {
  session_count: number;
  total_sets: number;
  total_volume_kg: number;
  sets_by_exercise: Record<string, number>;
  summary_text: string;
}

export const MEAL_TYPES = ["kahvaltı", "öğle", "akşam", "atıştırmalık"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface FoodCatalogItem {
  id: number;
  name_tr: string;
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

export interface Profile {
  goal: Goal | null;
  activity_level: ActivityLevel | null;
  dietary_restrictions: string | null;
  target_weight_kg: number | null;
  daily_calorie_goal: number | null;
  daily_protein_goal_g: number | null;
  daily_carbs_goal_g: number | null;
  daily_fat_goal_g: number | null;
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

/** access_token kısa ömürlü (30dk) — 401 alındığında, çağıran taraf hiçbir
 * şey bilmeden localStorage'daki refresh_token ile SESSİZCE bir kere
 * yenilenip istek tekrarlanır. `token` seçeneği geçilmemiş çağrılarda
 * (login/register/refresh'in kendisi) bu mantık hiç devreye girmez. */
async function tryRefreshStoredAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
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
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}, isRetry = false): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {};
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
    throw new ApiError("Backend'e ulaşılamıyor. Sunucu çalışıyor mu?", 0);
  }

  if (!response.ok) {
    if (response.status === 401 && token && !isRetry) {
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        return apiFetch<T>(path, { ...options, token: freshToken }, true);
      }
    }

    let detail = "Bilinmeyen bir hata oluştu.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
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

export function refreshAccessToken(refreshToken: string) {
  return apiFetch<TokenResponse>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
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

export function getProgressLogs(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiFetch<ProgressLog[]>(`/progress/logs${query}`, { token });
}

export function getWeeklySummary(token: string) {
  return apiFetch<WeeklySummary>("/progress/weekly-summary", { token });
}

export function getCheckins(token: string) {
  return apiFetch<CheckinMessage[]>("/checkins", { token });
}

export function searchExercises(token: string, query: string) {
  return apiFetch<ExerciseCatalogItem[]>(`/workouts/exercises/search?q=${encodeURIComponent(query)}`, {
    token,
  });
}

export function logWorkoutSession(token: string, payload: WorkoutSessionPayload) {
  return apiFetch<WorkoutSession>("/workouts/sessions", { method: "POST", body: payload, token });
}

export function getWorkoutSessions(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiFetch<WorkoutSession[]>(`/workouts/sessions${query}`, { token });
}

export function getWorkoutSummary(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiFetch<WorkoutSummary>(`/workouts/summary${query}`, { token });
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

export function getMealEntries(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
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
}

export interface PhotoMealAnalysis {
  items: PhotoMealItem[];
}

async function postPhotoForAnalysis(
  token: string,
  file: File,
  isRetry = false
): Promise<PhotoMealAnalysis> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/nutrition/photo-analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch {
    throw new ApiError("Backend'e ulaşılamıyor. Sunucu çalışıyor mu?", 0);
  }

  if (!response.ok) {
    if (response.status === 401 && !isRetry) {
      const freshToken = await tryRefreshStoredAccessToken();
      if (freshToken) {
        return postPhotoForAnalysis(freshToken, file, true);
      }
    }
    let detail = "Bilinmeyen bir hata oluştu.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
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

export interface DailyTip {
  tip: string;
  date: string;
}

export function getDailyTip(token: string) {
  return apiFetch<DailyTip>("/daily-tip", { token });
}
