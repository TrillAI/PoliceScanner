# Radio transcriber

The live transcription service for the app. It pulls each licensed feed,
cuts the audio into radio transmissions, transcribes them with
faster-whisper, drops Whisper's known hallucinations, and serves the results
to the app over HTTP. The app runs the same keyword and severity logic on the
results it receives.

```
feed stream ─ffmpeg (radio band filter)─▶ 16 kHz PCM ─VAD + silence cut─▶ transmissions
   ─per-transmission level─▶ faster-whisper ─▶ hypotheses ─filters─▶ transcript store ─HTTP─▶ app
```

Only point it at feeds you are licensed to use. Stream URLs go in a
`feeds.json` on the server, never in the repository.

## What makes it accurate on radio

| Stage | What it does | Why it matters for radio |
| --- | --- | --- |
| Band filter (`audio.py`) | ffmpeg `highpass=f=300,lowpass=f=3400` before decoding | Police radio is narrowband. Hum, rumble, and hiss outside the speech band are removed before the recognizer sees them. Set `RADIO_AUDIO_FILTER=off` to compare. |
| Level (`audio.py`) | Each transmission is scaled so its peak sits at a fixed level | Units transmit at very different levels, from the mic up close to the edge of coverage. A consistent level helps the recognizer. |
| Segmentation (`segmenter.py`) | Silero VAD finds speech; a transmission ends after 600 ms of silence | Radio is push-to-talk. Fixed-length chunks cut words in half. |
| Short transmissions | Minimum length is 0.3 s | Brief traffic like "10-4" and "copy" is about half a second. A 0.6 s minimum drops it. |
| Hotwords (`engine.py`, `config.py`) | Biases decoding toward ten-codes, priority codes, and dispatch phrases | Makes "10-4", "code 3", and "shots fired" come out as written. |
| No cross-talk context | `condition_on_previous_text=False` | One misheard word does not repeat into later calls. |
| English fixed | `language="en"` | Auto-detect on short noisy clips often picks the wrong language. |
| Hallucination filter (`filters.py`) | Drops stock phrases, no-speech, low-confidence, and repetition loops | Whisper invents "Thanks for watching" on static. Those must not raise alerts. |
| Normalization (`normalize.py`) | "ten four" → "10-4", "code three" → "code 3", and mishearings such as "ten for" → "10-4", "code tree" → "code 3", "shot fired" → "shots fired" | Same canonical text the app matches keywords against. The mishearing rules are plausible fixes, not measured on real audio. |

Accuracy depends most on the model size and the audio quality. Measure it on
your own clips (see below) before you trust it.

## Run it

### Docker (recommended)

```bash
cp transcriber/feeds.example.json feeds.json          # fill in licensed stream URLs
cp transcriber/.env.example .env                      # set TRANSCRIBER_TOKEN, model, etc.
docker build -t radio-transcriber transcriber/
docker run -d --name radio-transcriber -p 8787:8787 \
  --env-file .env -v "$PWD/feeds.json:/config/feeds.json:ro" \
  -v radio-models:/models radio-transcriber
```

The first start downloads the model from Hugging Face into the `radio-models`
volume. Later starts reuse it. Run exactly one worker: the model and feed
threads live in one process.

### Local

```bash
cd transcriber
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export FEEDS_FILE=./feeds.json WHISPER_MODEL=small.en
uvicorn radio_transcriber.app:get_app --factory --host 0.0.0.0 --port 8787 --workers 1
```

## Connect the app

Set these when you build or run the app (they are public, see below):

```bash
EXPO_PUBLIC_TRANSCRIBER_URL=https://your-transcriber.example.com
EXPO_PUBLIC_TRANSCRIBER_TOKEN=the-same-value-as-TRANSCRIBER_TOKEN   # optional
```

Without `EXPO_PUBLIC_TRANSCRIBER_URL` the app stays in demo mode. Put the
server behind HTTPS. Native apps do not use CORS. A web build does, so set
`CORS_ORIGINS` to your web origin.

**Token caveat:** anything prefixed `EXPO_PUBLIC_` is compiled into the app and
visible to anyone who inspects it. Treat the token as a shared, low-value key,
or put the service behind an authenticated proxy and leave the token unset.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Open (no token). Per-feed state and drop counts. |
| GET | `/feeds` | Feed ids and state. Stream URLs are never returned. |
| GET | `/feeds/{id}/transcripts` | `?after=SEQ` returns records with seq > SEQ. Without `after` it returns the cursor only, so a new client does not replay old traffic. |

Each record: `seq`, `feedId`, `startedAt` (unix seconds), `durationS`, `text`
(as recognized), `normalized` (canonical form), `confidence` (0–1, from the
average token log-probability).

Requests require `Authorization: Bearer <TRANSCRIBER_TOKEN>` when the token is
set.

## Settings

Set these in `.env`. Defaults are in `radio_transcriber/config.py`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FEEDS_FILE` | required | JSON file listing feed ids and stream URLs |
| `WHISPER_MODEL` | `small.en` | faster-whisper model name or local directory |
| `WHISPER_DEVICE` | `auto` | `cpu`, `cuda`, or `auto` |
| `WHISPER_COMPUTE_TYPE` | `default` | `int8` on CPU, `float16` on GPU |
| `RADIO_HOTWORDS` | radio vocabulary | Words biased into decoding |
| `RADIO_AUDIO_FILTER` | `highpass=f=300,lowpass=f=3400` | ffmpeg filter before decoding. `off` disables it |
| `PEAK_NORMALIZE` | `1` | Scale each transmission to a consistent level (`0` disables) |
| `SILENCE_MS` | `600` | Silence that ends a transmission |
| `MIN_UTTERANCE_S` | `0.3` | Shortest transmission kept |
| `MAX_UTTERANCE_S` | `25` | Longest transmission before a forced cut |
| `MAX_NO_SPEECH_PROB` | `0.6` | Hallucination filter |
| `MIN_AVG_LOGPROB` | `-1.0` | Hallucination filter |
| `MAX_COMPRESSION_RATIO` | `2.4` | Hallucination filter (repetition) |
| `TRANSCRIBER_TOKEN` | unset | Bearer token for the API. Set it on any reachable server |
| `CORS_ORIGINS` | `*` | Comma-separated origins allowed to call the API |

## Measure accuracy on your audio

Accuracy depends on your feeds and your radios. The defaults above are a
reasoned starting point, not measured results.

1. Record real transmissions from your feeds (with permission), 5–30 seconds each.
   Include noisy and short ones.
2. Write a manifest, one clip per line, with a human-checked transcript:

   ```
   # path<TAB>reference
   clips/unit4_10-4.wav	Unit 4 copy 10-4
   clips/shots_fired.wav	Shots fired at Broadway and 5th
   ```

3. Run the eval with the same settings you deploy with:

   ```bash
   python -m radio_transcriber.eval clips.tsv --model small.en --device cpu --json results.json
   ```

   It prints the word error rate per clip and overall. Both reference and
   hypothesis go through the same normalization, so "ten four" and "10-4" count as
   the same words. Use the per-clip `dropped` list to see when a filter removed a
   real transmission.

4. Compare the choices that matter. Keep whichever gives the lowest word error rate:

   ```bash
   python -m radio_transcriber.eval clips.tsv --audio-filter off
   python -m radio_transcriber.eval clips.tsv --no-peak-normalize
   python -m radio_transcriber.eval clips.tsv --silence-ms 400
   ```

Try `small.en` against `medium.en` (GPU) and tune `SILENCE_MS`,
`MIN_AVG_LOGPROB`, and `RADIO_HOTWORDS` against that number. Keep the clips
for regression tests.

## Tests

```bash
cd transcriber
PYTHONPATH=. python -m unittest discover -s tests -t .
```

The tests cover normalization, filters, segmentation, ffmpeg decoding (including
the band filter's effect on hum and speech-band tones), level normalization,
configuration, the full file-to-store pipeline (with a stub speech engine and
energy-based VAD), and the HTTP API. They do not measure accuracy; that needs real
model weights and recorded clips, which the eval tool covers.

The app-side normalizer must match the Python one. From the repository root:

```bash
node transcriber/tests/check_ts_normalizer.js
```

Run it after changing `radio_transcriber/normalize.py` or
`services/transcriptNormalizer.ts`. Both read the same corpus,
`tests/normalize_corpus.json`.

## Limits

- Word accuracy on real radio audio has not been measured. The tests cover the
  pipeline logic, not the recognizer.
- The radio mishearing corrections are plausible fixes for how these phrases are
  commonly misheard. They are not measured against real audio.
- The in-memory transcript store holds the most recent 500 records per feed and is lost on restart. Persist it if you need history.
- Expected latency per transmission is the silence threshold plus model time, typically a few seconds. Measure it on your hardware.
- Stream reconnection is automatic, with backoff up to 60 seconds.
- Radio is half-duplex and audio quality varies by unit. Expect more errors from mobile units at the edge of coverage and from overlapping transmissions.
- Licensed feeds only. Check the feed provider's terms before recording or transcribing.
