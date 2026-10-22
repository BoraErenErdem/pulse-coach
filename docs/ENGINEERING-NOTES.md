# Engineering notes

These are the problems that taught the most while building PulseCoach, and the decisions that shaped it. Each entry
covers what went wrong, how the cause was found, and what changed. Most of these bugs looked random at first and
turned out to be deterministic.

**Bugs**

1. [The coach said "3 sets" and saved one](#1-the-coach-said-3-sets-and-saved-one)
2. ["Random" chat failures that were an ORM cache](#2-random-chat-failures-that-were-an-orm-cache)
3. [Streaming without deadlocks](#3-streaming-without-deadlocks)
4. [The Turkish dotted capital I](#4-the-turkish-dotted-capital-i)
5. [Time zones: three separate bugs](#5-time-zones-three-separate-bugs)
6. [Logs that silently disappeared](#6-logs-that-silently-disappeared)
7. [One huge number broke a user's summary for good](#7-one-huge-number-broke-a-users-summary-for-good)
8. [Showing the model a candidate list made matching worse](#8-showing-the-model-a-candidate-list-made-matching-worse)
9. [Mobile performance: measure first](#9-mobile-performance-measure-first)
10. [A benchmark that measured model loading](#10-a-benchmark-that-measured-model-loading)
11. [Building the food catalog three times](#11-building-the-food-catalog-three-times)

**Decisions**

- [Decisions and trade-offs](#decisions-and-trade-offs)

---

## 1. The coach said "3 sets" and saved one

**Symptom.** *"Squat, 3 sets of 10 at 62.5 kg"* was sometimes saved as a single set, while the coach replied *"I've
logged your 3 sets."* It happened in roughly 1 out of 4 runs and never in unit tests.

**Cause.** The model sometimes called the single-set tool with an extra `set_count=3` argument. The tool had no such
parameter, and LangChain dropped the unknown argument without an error. The tool saved one set and the model reported
what it had intended to do.

**How it was found.** Guessing pointed at the duplicate-set guard. The real cause appeared only after running the real
model against a copy of the database with a spy on `create_agent` that recorded every tool call and its arguments.

**Fix.** The single-set tool now accepts `set_count` and hands anything above 1 to the bulk tool. Bulk calls are
capped at 50 sets. More importantly, this became `eval/chat_regression.py`: real sentences, run 5 times each, checked
against what is in the database. Every change to prompts, tools or the agent runs it. It has since caught regressions
that a reply-only check would have missed.

**Lesson.** With LLM tool calls, check what was written, not what was said.

## 2. "Random" chat failures that were an ORM cache

**Symptom.** For days, food search sometimes returned 500 and the chat sometimes answered *"I'm having trouble
connecting."* Restarting the server seemed to help for a while. It looked like a model or capacity problem.

**Cause.** The food and exercise catalog services cached catalog rows per database engine to avoid re-reading 8,000
rows. Those rows were still SQLAlchemy objects attached to the session of the request that first loaded them. When
that session committed, SQLAlchemy's default `expire_on_commit` expired every attribute. The next request got a
detached, expired object from the cache, and reading `.id` raised `DetachedInstanceError` inside the agent. The
orchestrator's catch-all turned that into the generic "connection" message.

It was not random. The first commit after a restart broke the cache entry for good, and every later request that
touched it failed until the next restart.

**Fix.** `db.expunge(row)` before caching, so cached rows no longer belong to any session. A diagnostic script that ran
six chat turns, each with a fresh session, went from 1/6 to 6/6. A broader set of logging prompts went from 0/12 to
11/12 fully correct.

**Lesson.** Rule out deterministic causes before blaming the model. Never cache ORM objects across requests: cache
plain data, or detach the objects.

## 3. Streaming without deadlocks

**Goal.** Show the reply as it is generated, plus a status line while tools run (*"Checking your meals"*).

**What failed.** LangGraph's `stream_mode="messages"` was the obvious choice. Combined with `max_concurrency=1` it
deadlocked. `max_concurrency=1` was there because parallel tool calls on the shared, non-thread-safe SQLAlchemy
session crashed with *"session is in 'prepared' state"*. Removing it would bring that crash back.

**Fix.** A LangChain callback handler collects tokens and tool events into a queue, the agent runs in a worker
thread, and the HTTP response drains the queue as Server-Sent Events. The streamed text is a draft. The final `done`
event carries the reply after all guards ran, and the client swaps it in.

**Also tried and rejected:** stopping generation once the sentence cap is reached. Cutting the stream from inside
LangGraph did not close the Ollama connection, so the next request paid 2–3 extra seconds. Worse, if the cut came
before a tool call, the record would be silently lost. The cap now applies to what is shown, and the prompt asks for
the right length up front (which also made brief replies about 40% faster).

## 4. The Turkish dotted capital I

**Symptom.** The crisis layer missed messages that started with *"İntihar…"* ("Suicide…"), which is exactly where a
capitalized word appears.

**Cause.** Python's `str.lower()` turns `"İ"` (U+0130) into `"i̇"`, an `i` followed by a combining dot (U+0307). The
lowercased text no longer contained the plain `"intihar"` pattern.

**Fix.** A shared `tr_lower()` that maps `İ→i` and `I→ı` before lowercasing. The same class of bug came back four or
five more times in other places (exercise search, food matching, the eval script), so `tr_lower` is now the only
allowed way to fold case, and there are tests for it. The crisis patterns also normalize punctuation, line breaks and
missing Turkish characters, and allow up to two filler words inside a phrase. That widening then caused a false
positive (*"kendimi keşfetmek"*, "discovering myself", matched a self-harm stem), so the stems were narrowed to
specific verb forms. Today there are dozens of crisis test cases, and the bar is that none are missed.

## 5. Time zones: three separate bugs

1. **UTC dates on the server.** Workouts logged between 00:00 and 03:00 in Istanbul were stored as the previous day.
   Now clients send `X-Timezone`, it is stored on the user, and every "today" comes from `user_time.user_today()`.
2. **PostgreSQL session time zone.** Timestamps are stored without a time zone. On a server whose local zone was
   Europe/Istanbul, values shifted by three hours when moving from SQLite to PostgreSQL. The app now sets the session
   time zone to UTC on every connection, and a Postgres-only test guards it.
3. **Averaging clock times.** An earlier version of the weekly check-in estimated the user's usual chat hour with a
   plain mean of UTC timestamps, so 23:00 and 01:00 averaged to 12:00. It was changed to local time and a circular
   mean. A code review then found that two opposite hours (08:00 and 20:00) still landed in the middle of the night,
   and that case was handled too. The estimate was later removed altogether when server push was dropped.

## 6. Logs that silently disappeared

After switching from `create_all` to Alembic, application `logger.info()` calls stopped appearing, in production too.
Nobody noticed for weeks, until a `caplog` test kept coming back empty.

Alembic's `env.py` calls `logging.config.fileConfig()`, which by default **disables every existing logger**. Migrations
run on startup after the routers and services are imported, so all their loggers were switched off. Adding handlers
does not help, because `Logger.handle()` checks the `disabled` flag first. The fix is one argument:
`fileConfig(..., disable_existing_loggers=False)`.

## 7. One huge number broke a user's summary for good

A single set with a weight of `1e308` made the workout summary endpoint fail on every later request: the volume sum
overflowed. Inputs had types but no upper bounds. Now every numeric input, from the API or from the model, goes
through `services/limits.py` (weight 0–1000 kg, reps ≤ 1000, duration ≤ 1440 min, food ≤ 5000 g, and so on). Path IDs
above 2³¹ return 404 instead of a database error. The same audit fixed a pending OAuth token that was accepted as an
access token (tokens now carry a `typ` claim), and a refresh that deleted the user's tokens on a network error, which
logged out anyone who opened the app offline.

## 8. Showing the model a candidate list made matching worse

The first version of the exercise resolver gave the model the phrase plus the top catalog candidates and asked it to
choose. It picked plausible but wrong candidates (*"pendulum squat" → "Squat"*) and even rewrote the name to fit a
candidate. Removing the list and asking only *"what is the standard English name of this movement?"* worked much
better. Code then does the choosing, and it refuses to link when no candidate contains every word of the name. On
230 labeled phrases, wrong matches fell from 49 to 21 out of 190 hard cases. Details in
[AI.md](AI.md#matching-free-text-to-the-catalogs).

## 9. Mobile performance: measure first

**Symptom.** Switching tabs quickly on the iPhone stuttered, especially on the Progress tab.

**What did not work.** Several reasonable guesses helped only a little. `freezeOnBlur`, added so hidden tabs would stop
rendering, added about 50 ms of its own work to every switch and was removed. `startTransition` made the tab bar move
before the content appeared and was reverted.

**What worked** came from the React Native DevTools profiler (ranked view, per commit):

- One 249 ms commit rendered every panel at once, including 18 confetti pieces and 5 flame particles that were mounted
  even when there was nothing to celebrate.
- Every context provider (auth, language, theme, profile, app lock, notifications) passed a new object as its value on
  each render, which re-rendered the whole app.
- A color hook returned a new object every call, which silently invalidated every memoized value built from it.
- About seven animated counters each ran their own `requestAnimationFrame` loop. They now share one clock, so React
  batches the updates (JS frame rate went from about 16 to 35 before the other fixes).

The fixes were memoized providers and props, a skeleton commit followed by the heavy charts one frame later, a shared
animation clock, and `useDebouncedFocusEffect`, which skips loading for tabs the user only passes through. After that
the app felt smooth on the device. The rule since then: no performance change without a profile.

## 10. A benchmark that measured model loading

In the first model comparison, `gemma4:e4b` and `qwen3:14b` showed almost the same latency. The script alternated
models scenario by scenario, so Ollama swapped a model in and out of GPU memory on nearly every call and added 8–14
seconds each time. Batching all scenarios per model showed `e4b` was about 40% faster. The same trap exists in
production: any request with a different `num_ctx` reloads the model. The warm-up service and every benchmark use the
app's exact context size.

## 11. Building the food catalog three times

Calorie numbers are only as good as the catalog behind them, and getting it right took three attempts.

1. **USDA, about 2,000 foods.** Matching was the first problem: `rapidfuzz`'s default scorer confidently matched
   *"kırmızı mercimek"* (red lentils) to *"Armut, çiğ, kırmızı anjou"* (a red pear). It was replaced by a staged
   matcher (prefix, then all words present, then fuzzy only as a last resort) that every catalog search still uses.
2. **Turkish sources only, 89 foods.** USDA was dropped for hand-researched Turkish entries. Every candidate had to pass
   a consistency check (calories within about 15% of 4 × protein + 4 × carbs + 9 × fat), and dishes whose sources
   disagreed by more than 2× (several stews, mantı, menemen) were left out rather than guessed. Some Turkish calorie
   sites turned out to copy each other, so two of them agreeing was not independent confirmation. The result was
   accurate but far too small.
3. **Hybrid, about 7,900 foods.** USDA came back with wider coverage: SR Legacy, Foundation Foods and the FNDDS survey
   foods, deliberately without the 400,000 branded products. `gemma4:12b` translated all 7,861 descriptions to
   Turkish (thinking off: same quality, four times faster), in about 87 minutes with no errors. 114 groups of
   duplicates (the same food from different USDA sources translating to the same name) were resolved by source
   priority: hand-researched, then Foundation, SR Legacy, survey. The Turkish entries were kept, and more have been
   added since.

An automatic scan then checked every row for calorie and macro consistency and flagged 88. None were real errors: 86
were alcoholic drinks, whose alcohol energy has no macro field, so the 4/4/9 rule cannot add up. That is why the scan
reports and a person decides, instead of the script "fixing" rows.

A full regression pass found one more silent error: *"domates"* (tomato) matched *"domates tozu"* (tomato powder),
about 17 times the calories, because the shorter name won among prefix matches. Ranking now puts an exact name or a
qualified variant first, and the curation step was checked for basics it had dropped (raw tomato, cooked oats, chia,
raw almonds and honey were added). Search works on both the Turkish and the English names.

---

## Decisions and trade-offs

**Own GPU server instead of a hosted AI API.** Health data is sensitive, and sending it to a third-party AI provider
abroad would need extra consent, contracts and cross-border transfer rules under KVKK. A single GPU server in Turkey
keeps the data in one place and makes the cost predictable. The cost is a smaller model, which is why so much of the
system checks the model's work.

**Calories never come from the model.** Typed meals, chat meals and photo meals all compute nutrition from the
catalog. The vision model only names foods and estimates grams, and the user confirms them.

**No edit or delete from the chat.** Fixing a wrong record by chatting is convenient. Deleting the wrong record is not
recoverable. The coach explains how to edit on the screen instead, and logging tools are disabled for that turn so a
correction does not create a duplicate.

**No calorie estimate for strength training.** Cardio uses MET values. For lifting, the available formulas were too
rough to present as a number next to precise meal data.

**No server push.** Push notifications would send device tokens and notification text through a provider abroad. The
app schedules its own reminders with generic text, and the content waits inside the app.

**SQLite for development, PostgreSQL in production, tests on both.** Development stays zero-setup, and CI runs the full
suite on PostgreSQL. That caught the foreign-key and time-zone differences that SQLite hides.

**One agent with many tools.** Simpler to reason about, faster on a small model, and evaluated end to end.

**Deterministic safety, LLM for tone.** Crisis detection, the calorie floor, numeric limits and "was it really saved?"
are code. The model handles language, tone and choosing tools.

**A landing page inside the web app.** An external site builder was evaluated first. It sent form data abroad and had
a template privacy link, so the landing page became part of the Next.js app, with the same design language and legal
pages.
