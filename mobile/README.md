# PulseCoach iOS app

The iOS app of [PulseCoach](../README.md). Expo SDK 54, React Native 0.81, Expo Router and TypeScript.

```bash
npm install
npx expo start --dev-client   # needs a development build (EAS); port 8081 also serves a web preview
npx tsc --noEmit
npx expo lint
```

| Path | Contents |
|---|---|
| `app/(auth)/` | Welcome, sign-in, registration (with KVKK consent), password reset, social sign-in consent |
| `app/(tabs)/` | Chat, Progress, Workouts, Nutrition, Profile |
| `app/*.tsx` | Goal Center, mood history, exercise history, check-ins, settings, legal pages |
| `components/*-identity.ts` | Color identity of each tab |
| `lib/api.ts` | API client (mirrors `web/src/lib/api.ts`), checked against the backend schema by `api-contract.ts` |
| `lib/local-notifications.ts` | Reminders scheduled on the device (no server push) |
| `store/` | App Store listing texts and the screenshot pipeline |

Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to the backend URL (your computer's LAN IP in development).
New native modules must be imported dynamically and need a new development build. After a backend API change, run
`npm run gen:api`.

More: [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#ios-app), [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#clients).
