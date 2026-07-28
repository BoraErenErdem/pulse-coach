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
