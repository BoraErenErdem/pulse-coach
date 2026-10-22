# PulseCoach web

The landing page and the web app of [PulseCoach](../README.md), live at [pulsecoachapp.com](https://pulsecoachapp.com).
Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4.

```bash
npm install
npm run dev            # http://localhost:3000, expects the backend on http://localhost:8000
npx tsc --noEmit
npx eslint src
npx playwright test    # needs the backend; e2e/chat.spec.ts also needs Ollama
```

| Path | Contents |
|---|---|
| `src/app/page.tsx` | Landing page (TR/EN, `?lang=en`) |
| `src/app/(app)/` | Signed-in app: chat, progress, workouts, nutrition, goals, mood, check-ins, profile |
| `src/app/kvkk`, `terms`, `us-health-data` | Legal pages, generated from `tools/legal_texts/` |
| `src/lib/api.ts` | API client (mirrored in `mobile/lib/api.ts`), checked against the backend schema by `api-contract.ts` |
| `src/components/charts/` | SVG charts |
| `e2e/` | Playwright tests |

Environment (`.env.local`): `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `NEXT_PUBLIC_SITE_URL`.
After a backend API change, run `npm run gen:api`.

More: [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md#web-app), [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#clients).
