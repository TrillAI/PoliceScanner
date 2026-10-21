# Radio transcriber

The live transcription service for the app. It pulls each licensed feed,
cuts the audio into radio transmissions, transcribes them with
faster-whisper, drops Whisper's known hallucinations, and serves the results
to the app over HTTP. The app runs the same keyword and severity logic on the
results it receives.

```
feed stream ─ffmpeg─▶ 16 kHz PCM ─VAD + silence cut─▶ transmissions
   ─faster-whisper─▶ hypotheses ─filters─▶ transcript store ─HTTP─▶ app
```

## What makes it accurate on radio

| Stage | What it does | Why it matters for radio |
| --- | --- | --- |
| Segmentation (`segmenter.py`) | Silero VAD finds speech; a transmission ends after 600 ms of silence | Radio is push-to-talk. Fixed-length chunks cut words in half. |
| Hotwords (`engine.py`) | Biases decoding toward ten-codes and dispatch phrases | Makes "10-4" and "code 3" come out as written. |
| No cross-talk context | `condition_on_previous_text=False` | One misheard word does not repeat into later calls. |
| English fixed | `language="en"` | Auto-detect on short noisy clips often picks the wrong language. |
| Hallucination filter (`filters.py`) | Drops stock phrases, no-speech, low-confidence, and repetition loops | Whisper invents "Thanks for watching" on static. Those must not raise alerts. |
| Normalization (`normalize.py`) | "ten four" → "10-4", "code three" → "code 3" | Same canonical text the app matches keywords against. |

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

Without `EXPO_PUBLIC_TRANSCRIBER_URL` the app stays in demo mode.

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

## Measure accuracy on your audio

1. Record real transmissions from your feeds (with permission), 5–30 seconds each.
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

Try `small.en` against `medium.en` (GPU) and tune `SILENCE_MS`,
`MIN_AVG_LOGPROB`, and `RADIO_HOTWORDS` against that number. Keep the clips
for regression tests.

## Tests

```bash
cd transcriber
PYTHONPATH=. python -m unittest discover -s tests -t .
```

The tests cover normalization, filters, segmentation, ffmpeg decoding, the
full file-to-store pipeline (with a stub speech engine and energy-based VAD),
and the HTTP API. They do not measure accuracy; that needs real model
weights and recorded clips, which the eval tool covers.

## Limits

- The in-memory transcript store holds the most recent 500 records per feed and is lost on restart. Persist it if you need history.
- Expected latency per transmission is the silence threshold plus model time, typically a few seconds. Measure it on your hardware.
- Stream reconnection is automatic, with backoff up to 60 seconds.
- Licensed feeds only. Check the feed provider's terms before recording or transcribing.
