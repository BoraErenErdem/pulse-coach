# Privacy and compliance

PulseCoach stores exercise, nutrition, body measurement, mood and chat data. Most privacy laws treat this as
sensitive health data. This document describes how the system is built to protect it, and how that maps to the laws
that apply. The legal texts themselves are on the website: [Privacy notice (KVKK)](https://pulsecoachapp.com/kvkk?lang=en),
[Terms](https://pulsecoachapp.com/terms?lang=en) and
[U.S. Consumer Health Data Privacy Policy](https://pulsecoachapp.com/us-health-data).

> This is an engineering description, not legal advice.

## Principles

1. **Collect only what a feature needs.** Height, birth year and sex are optional and are used only for the calorie
   recommendation. Even the coach's profile tool cannot see age or sex.
2. **Process data where it is stored.** The language model, the vision model and the embeddings run on our own
   server. No message, photo or health record is sent to a third-party AI service, and data is never used to train
   models.
3. **No ads, no tracking, no data sales.** There are no analytics or advertising SDKs in the web app or the iOS app.
4. **The user stays in control.** Export all data or delete the account at any time, from inside the app.

## Where data lives and who processes it

| What | Where |
|---|---|
| Application, database, AI models | One server in a data center in Turkey (provider: Cloudvist, Istanbul), acting as a processor |
| Backups | Encrypted with rclone `crypt` before leaving the server, stored in Turkey, kept for 30 days |
| Password reset and support emails | Uzman Posta (Istanbul). Emails contain only a reset link, never health data |
| Sign in with Google / Apple | Only if the user chooses it. The ID token is verified, and no health data goes to them |
| DNS | Cloudflare, DNS only. Traffic does not pass through Cloudflare |

Data does not leave Turkey for processing. The Google sign-in button on the web is the only third-party script, and it
loads only where the sign-in buttons are shown.

## Technical safeguards

- HTTPS everywhere (Caddy, Let's Encrypt, HSTS). PostgreSQL and Ollama are reachable only from the server itself.
  SSH is key-only.
- Passwords hashed with bcrypt. Refresh and password reset tokens are stored only as hashes. Access tokens expire after
  30 minutes.
- The services run as an unprivileged user that cannot modify the application code.
- Strict Content Security Policy on the web. On iOS, tokens are kept in the Keychain, with an optional Face ID lock
  and jailbreak detection.
- Rate limits and daily quotas on login, registration, password reset, chat and photo analysis.
- Retention limits: meal photos are deleted beyond a count and age limit, and rate limit records after a few days.
- The crisis layer logs only that it triggered, never the message.
- **No server push.** Reminders are scheduled on the device. Their text is generic (*"How's your day going? Don't forget
  to log your meals and mood."*), with no numbers or personal details on the lock screen, and no device token is sent
  to a push provider abroad.

## Security reviews

Four reviews were done before launch, each with static review of the code and live attempts against a running
server, and every finding was fixed and tested:

| Review | Method | Main fixes |
|---|---|---|
| August 2026 (1) | Backend, web and mobile code review, then checks on a real device | Login rate limit per account **and** per IP (against password spraying), reset links redacted from logs, Content Security Policy and security headers on the web, HTTPS enforced in production iOS builds, Face ID / passcode app lock |
| August 2026 (2) | Code review and live checks on web and the iOS web preview | Global 12 MB request body limit (the photo endpoint used to read a whole upload before checking its size), length limits on every text field, unsafe link schemes (`javascript:`, `data:`) blocked in chat Markdown on iOS as on the web, an unused Android microphone permission removed, startup refused with the default JWT secret |
| September 2026 (1) | Every router checked for authentication and ownership, black-box attempts with two test users trying to read and change each other's records, browser walkthrough | Emails normalized (two spellings could create two accounts), oversized IDs in the URL returned 500 instead of 404, upper bounds on goal values |
| September 2026 (2) | Full project audit including the agent | Pending social sign-in tokens could act as access tokens (now typed), unbounded numbers in sets, meals and goals, offline app start logged users out |

Cross-user isolation has its own automated tests (`tests/test_isolation.py`), and the deploy smoke test checks that
no service runs as root or listens outside localhost.

## User rights in the product

| Right | Where |
|---|---|
| Access / portability | Profile → *Download my data*: a JSON export of every record (`GET /users/me/export`). Every new data field must be added to `data_export_service.py`, and this is part of the project's checklist. |
| Deletion | Profile → *Delete my account*: removes the account and all related records (`DELETE /users/me`). The password is asked again, so a stolen session cannot delete an account with one request. Backups age out within 30 days. |
| Correction | Every record can be edited or deleted on its screen. |
| Clear chat | The chat history can be cleared on its own. |
| Withdraw consent | Deleting the account withdraws consent. Notification types can be turned off one by one. |

## Turkey: KVKK

- **Separate consents at registration**, each stored with a timestamp and the text version (`consent_version`): the
  privacy notice, explicit consent for processing health data (KVKK Article 6 treats it as special category data),
  and the Terms of Use. Google and Apple sign-in go through the same consent screen before an account is created.
- **Hosting in Turkey** avoids the cross-border transfer rules of Article 9. That is why the launch plan switched from a
  GPU cloud abroad to a Turkish provider, and why server push (through a provider abroad) was replaced with local
  notifications.
- The legal texts are generated from a single source (`tools/legal_texts/content.py`) into the web pages and the iOS
  screens, in Turkish and English, so the versions cannot drift apart.
- The app is for adults (18+): health data consent and calorie-deficit advice are not appropriate for minors.

## United States

The iOS app is available in the United States. There is no size threshold in several state health data laws, so the
following were applied (the full mapping is in [`tools/legal_texts/US_COMPLIANCE.md`](../tools/legal_texts/US_COMPLIANCE.md),
in Turkish):

| Law | What it required |
|---|---|
| Washington My Health My Data Act | A separate Consumer Health Data Privacy Policy, linked from the home page, the sign-in and registration pages and the app settings. Access, deletion and consent withdrawal rights, with a 45-day response and an appeal process |
| Nevada SB 370 | The same policy, plus a statement about third-party collection across sites |
| Connecticut (consumer health data provisions) | Opt-in consent before processing, and a written data protection assessment |
| California CalOPPA | Do Not Track and third-party tracking statements, and an effective date |
| FTC Health Breach Notification Rule | A breach notification procedure (diet and fitness apps are explicitly covered) |

Out of scope after review: HIPAA (PulseCoach is not a covered entity), CCPA/CPRA and most general state privacy laws
(thresholds), COPPA (18+). The European Union is deliberately not a launch market.

## Medical boundaries

PulseCoach is not a medical device and says so at registration, in the Terms and in the App Store listing. The coach
is instructed not to diagnose, prescribe or act as a therapist. Crisis language triggers a fixed, pre-written reply
with emergency contacts instead of model output (see [AI.md](AI.md#safety-crisis-layer-and-medical-limits)).

## Checklist for new features

When a feature adds a new kind of user data:

1. Migration, validation and an upper bound for every number (`services/limits.py`).
2. Add the field to the data export.
3. If it is a new category, purpose or recipient, update the legal texts in `tools/legal_texts/content.py`, regenerate
   the pages, and bump the consent version if consent must be collected again.
4. Re-check the data protection assessment in `US_COMPLIANCE.md`.
