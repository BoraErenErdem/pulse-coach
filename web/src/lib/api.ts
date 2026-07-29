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
  token_type: string;
}

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
}

export interface MealEntryPayload {
  food_catalog_id: number;
  quantity_grams: number;
  meal_type: MealType;
  log_date?: string;
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
  log_date: string;
}

export interface DailyNutritionSummary {
  entry_count: number;
  total_calories_kcal: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
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

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
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
