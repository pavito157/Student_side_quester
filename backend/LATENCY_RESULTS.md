# Quest generation latency — October 17, 2026

Synthetic requests used the same programming/nature preferences, relaxed vibe,
free budget, maximum 60 activity minutes, and no distance limit. No real student
data was sent and no Firestore writes were made.

## Model comparison

Both models used the compact prompt and structured JSON, with a 25-second read
timeout for this comparison. Flash used LOW thinking and Flash-Lite MINIMAL.
Each request used a new HTTP connection in this first comparison.

| Model | Sample 1 | Sample 2 | Sample 3 |
| --- | --- | --- | --- |
| gemini-3.8-flash | timed out at 25.09s | timed out at 25.07s | timed out at 25.06s |
| gemini-3.5-flash-lite | 1.949s | 1.099s | 1.257s |

All three Flash-Lite responses passed JSON and time/budget validation. The
comparison measures observed behavior during this run, not universal model speed.
The Flash failures are timeout-censored; they do not indicate completed latency.

## Final configuration

After adding connection reuse and a structured completion criterion (formatted
into the final instruction by the backend), three further fresh generations took:

| Sample | Time | Result |
| --- | --- | --- |
| 1 | 1.371s | Valid; 45 activity minutes, estimated $0 |
| 2 | 1.313s | Valid; 45 activity minutes, estimated $0 |
| 3 | 1.331s | Valid; 30 activity minutes, estimated $0 |

Median: **1.331 seconds**. These are new generations, not cached responses.
Settings: Flash-Lite, MINIMAL thinking, 1,536-token output cap, 20-second provider
read timeout, 5-second connection timeout. No automatic provider retries.

These measurements cover generation plus local validation, not a real signed-in
browser request. They exclude Firebase token retrieval, Firebase authentication,
browser/network overhead, UI rendering, and future destination resolution. Three
samples cannot establish tail-latency guarantees or promise a five-second total.

## Measuring the full browser path

The request helper accepts `{onTiming: (timing) => console.table(timing)}`. It
reports token retrieval, HTTP and total browser durations plus the server's
`Server-Timing` header (`auth`, `gemini`, optional `resolver`, `total`). All durations
are milliseconds. See [TASK4_GEMINI.md](TASK4_GEMINI.md) for the full console test.

Authentication still verifies revocation, email verification and the UF domain.
There is no shared cache of personal quests, pre-generated fallback, reduced
GPS validation, or change to frontend components. Existing assignment reuse
remains part of the subsequent persistence step.
