// API sözleşme denetimi (2026-09-26) - çalışma zamanında hiçbir şey yapmaz, yalnızca
// `tsc` çalıştırır. api.ts'teki elle yazılan tipler, backend'in OpenAPI şemasından
// üretilen api-schema.ts ile karşılaştırılır; backend bir alanı ekler/çıkarır ya da
// tipini değiştirirse (ör. null dönebilir olur) tsc burada hata verir.
// Şemayı yenilemek: backend'den `python -m scripts.export_openapi openapi.json`,
// sonra burada `npm run gen:api` (CI şemanın güncel olduğunu denetler).
// mobile/lib/api-contract.ts ile aynı içerik.
import type * as Api from "./api";
import type { components } from "./api-schema";

type Schemas = components["schemas"];

// Elle yazılan tiplerdeki dar harf birlikleri ("weight_loss" | ...) sunucuda `string`;
// karşılaştırmada genişletilir.
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends null | undefined
        ? T
        : T extends readonly (infer U)[]
          ? Widen<U>[]
          : T extends object
            ? { [K in keyof T]-?: Widen<T[K]> }
            : T;

// FastAPI varsayılanı olan alanları da yanıtta HER ZAMAN gönderir; şemada isteğe
// bağlı görünmeleri yanıltıcı.
type DeepRequired<T> = T extends readonly (infer U)[]
  ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<Exclude<T[K], undefined>> }
    : T;

/** Yanıt: sunucunun gönderebileceği her değer elle yazılan tipe uymalı ve şemadaki hiçbir alan eksik olmamalı. */
type ResponseMatches<Hand, Server> = [DeepRequired<Server>] extends [Widen<Hand>]
  ? [Exclude<keyof Server, keyof Hand>] extends [never]
    ? true
    : { eksikAlanlar: Exclude<keyof Server, keyof Hand> }
  : { uyumsuz: { elle: Widen<Hand>; sunucu: DeepRequired<Server> } };

/** İstek gövdesi: gönderilen her alan sunucunun şemasında olmalı ve tipi uymalı. */
type RequestMatches<Hand, Server> = [Hand] extends [Server]
  ? [Exclude<keyof Hand, keyof Server>] extends [never]
    ? true
    : { fazlaAlanlar: Exclude<keyof Hand, keyof Server> }
  : { uyumsuz: { elle: Hand; sunucu: Server } };

type Expect<T extends true> = T;

export type ApiContractChecks = [
  // Yanıtlar
  Expect<ResponseMatches<Api.UserRead, Schemas["UserRead"]>>,
  Expect<ResponseMatches<Api.TokenResponse, Schemas["Token"]>>,
  Expect<ResponseMatches<Api.ChatResponse, Schemas["ChatResponse"]>>,
  Expect<ResponseMatches<Api.ConversationMessage, Schemas["ConversationRead"]>>,
  Expect<ResponseMatches<Api.ProgressLog, Schemas["ProgressLogRead"]>>,
  Expect<ResponseMatches<Api.BodyCompositionInsight, Schemas["BodyCompositionInsightRead"]>>,
  Expect<ResponseMatches<Api.WeeklySummary, Schemas["WeeklySummaryRead"]>>,
  Expect<ResponseMatches<Api.WeeklyTrendPoint, Schemas["WeeklyTrendPointRead"]>>,
  Expect<ResponseMatches<Api.Trends, Schemas["TrendsRead"]>>,
  Expect<ResponseMatches<Api.CheckinMessage, Schemas["CheckinMessageRead"]>>,
  Expect<ResponseMatches<Api.ExerciseCatalogItem, Schemas["ExerciseCatalogRead"]>>,
  Expect<ResponseMatches<Api.WorkoutSet, Schemas["WorkoutSetRead"]>>,
  Expect<ResponseMatches<Api.WorkoutSession, Schemas["WorkoutSessionRead"]>>,
  Expect<ResponseMatches<Api.WorkoutSummary, Schemas["WorkoutSummaryRead"]>>,
  Expect<ResponseMatches<Api.LoggedExercise, Schemas["LoggedExerciseRead"]>>,
  Expect<ResponseMatches<Api.ExercisePeriodStat, Schemas["ExercisePeriodStatRead"]>>,
  Expect<ResponseMatches<Api.ExerciseHistoryEntry, Schemas["ExerciseHistoryEntryRead"]>>,
  Expect<ResponseMatches<Api.ExerciseHistory, Schemas["ExerciseHistoryRead"]>>,
  Expect<ResponseMatches<Api.FoodCatalogItem, Schemas["FoodCatalogRead"]>>,
  Expect<ResponseMatches<Api.MealEntry, Schemas["MealEntryRead"]>>,
  Expect<ResponseMatches<Api.DailyNutritionSummary, Schemas["DailyNutritionSummaryRead"]>>,
  Expect<ResponseMatches<Api.Profile, Schemas["ProfileRead"]>>,
  Expect<ResponseMatches<Api.CalorieRecommendation, Schemas["CalorieRecommendation"]>>,
  Expect<ResponseMatches<Api.ExerciseGoalProgress, Schemas["ExerciseGoalProgressRead"]>>,
  Expect<ResponseMatches<Api.OAuthResult, Schemas["OAuthResult"]>>,
  Expect<ResponseMatches<Api.WeeklyGoalDay, Schemas["WeeklyGoalDayRead"]>>,
  Expect<ResponseMatches<Api.WeeklyGoal, Schemas["WeeklyGoalRead"]>>,
  Expect<ResponseMatches<Api.PhotoMealItem, Schemas["PhotoMealItemRead"]>>,
  Expect<ResponseMatches<Api.PhotoMealAnalysis, Schemas["PhotoMealAnalysisRead"]>>,
  Expect<ResponseMatches<Api.MealPhoto, Schemas["MealPhotoRead"]>>,
  Expect<ResponseMatches<Api.MoodLog, Schemas["MoodLogRead"]>>,
  Expect<ResponseMatches<Api.MoodInsight, Schemas["MoodInsightRead"]>>,
  Expect<ResponseMatches<Api.DailyTip, Schemas["DailyTipRead"]>>,
  // İstek gövdeleri
  Expect<RequestMatches<Api.ProgressLogPayload, Schemas["ProgressLogCreate"]>>,
  Expect<RequestMatches<Api.ProgressLogUpdatePayload, Schemas["ProgressLogUpdate"]>>,
  Expect<RequestMatches<Api.WorkoutSetInput, Schemas["WorkoutSetCreate"]>>,
  Expect<RequestMatches<Api.WorkoutSessionPayload, Schemas["WorkoutSessionCreate"]>>,
  Expect<RequestMatches<Api.WorkoutSessionUpdatePayload, Schemas["WorkoutSessionUpdate"]>>,
  Expect<RequestMatches<Api.WorkoutSetUpdatePayload, Schemas["WorkoutSetUpdate"]>>,
  Expect<RequestMatches<Api.MealEntryPayload, Schemas["MealEntryCreate"]>>,
  Expect<RequestMatches<Api.MealEntryUpdatePayload, Schemas["MealEntryUpdate"]>>,
  Expect<RequestMatches<Api.ProfileUpdatePayload, Schemas["ProfileUpdate"]>>,
  Expect<RequestMatches<Api.ExerciseGoalCreatePayload, Schemas["ExerciseGoalCreate"]>>,
];
