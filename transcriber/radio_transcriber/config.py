"""Service configuration, read from environment variables and a feeds file."""

import json
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urlparse

from .audio import DEFAULT_RADIO_FILTER
from .filters import FilterSettings

FEED_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

# Biases decoding toward radio vocabulary: ten-codes, priority codes, and the
# phrases that carry call type and status on a dispatch channel.
DEFAULT_HOTWORDS = (
    "10-4 10-8 10-9 10-20 10-23 10-31 10-33 10-97 10-98 10-99 "
    "code 2 code 3 code 4 code 5 code 6 BOLO en route on scene clear copy "
    "dispatch negative affirmative say again stand by shots fired officer "
    "needs assistance in progress suspect armed"
)


@dataclass(frozen=True)
class Feed:
    id: str
    url: str


@dataclass(frozen=True)
class Settings:
    feeds: List[Feed]
    model: str = "small.en"
    device: str = "auto"
    compute_type: str = "default"
    model_dir: Optional[str] = None
    hotwords: str = DEFAULT_HOTWORDS
    ffmpeg_bin: str = "ffmpeg"
    token: Optional[str] = None
    cors_origins: List[str] = field(default_factory=lambda: ["*"])
    silence_ms: int = 600
    max_utterance_s: float = 25.0
    min_utterance_s: float = 0.3
    history_size: int = 500
    # ffmpeg audio filter applied before decoding; None decodes the raw stream.
    radio_filter: Optional[str] = DEFAULT_RADIO_FILTER
    # Scale each transmission to a consistent level before transcription.
    peak_normalize: bool = True
    filters: FilterSettings = FilterSettings()


def _load_feeds(path: str) -> List[Feed]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    feeds = []
    seen = set()
    for entry in data["feeds"]:
        feed_id = entry["id"]
        url = entry["url"]
        if not FEED_ID_RE.match(feed_id):
            raise ValueError(f"invalid feed id: {feed_id!r}")
        if feed_id in seen:
            raise ValueError(f"duplicate feed id: {feed_id!r}")
        # Only plain network streams. Other ffmpeg protocols (file:, concat:, pipe:)
        # could read local files if a config ever came from an untrusted source.
        if urlparse(url).scheme not in ("http", "https"):
            raise ValueError(f"feed {feed_id!r} must use an http(s) URL")
        seen.add(feed_id)
        feeds.append(Feed(id=feed_id, url=url))
    return feeds


def _default_ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def load_settings(env: Optional[dict] = None) -> Settings:
    env = dict(os.environ if env is None else env)
    feeds_file = env.get("FEEDS_FILE")
    if not feeds_file:
        raise RuntimeError("FEEDS_FILE must point to a JSON file listing the feed streams")

    origins = env.get("CORS_ORIGINS", "*")
    cors = [o.strip() for o in origins.split(",") if o.strip()] or ["*"]

    filters = FilterSettings(
        max_no_speech_prob=float(env.get("MAX_NO_SPEECH_PROB", "0.6")),
        min_avg_logprob=float(env.get("MIN_AVG_LOGPROB", "-1.0")),
        max_compression_ratio=float(env.get("MAX_COMPRESSION_RATIO", "2.4")),
    )

    return Settings(
        feeds=_load_feeds(feeds_file),
        model=env.get("WHISPER_MODEL", "small.en"),
        device=env.get("WHISPER_DEVICE", "auto"),
        compute_type=env.get("WHISPER_COMPUTE_TYPE", "default"),
        model_dir=env.get("WHISPER_MODEL_DIR") or None,
        hotwords=env.get("RADIO_HOTWORDS", DEFAULT_HOTWORDS),
        ffmpeg_bin=env.get("FFMPEG_BIN") or _default_ffmpeg(),
        token=env.get("TRANSCRIBER_TOKEN") or None,
        cors_origins=cors,
        silence_ms=int(env.get("SILENCE_MS", "600")),
        max_utterance_s=float(env.get("MAX_UTTERANCE_S", "25")),
        min_utterance_s=float(env.get("MIN_UTTERANCE_S", "0.3")),
        history_size=int(env.get("HISTORY_SIZE", "500")),
        radio_filter=_radio_filter(env),
        peak_normalize=env.get("PEAK_NORMALIZE", "1").strip().lower() not in ("0", "false", "off", "no"),
        filters=filters,
    )


def _radio_filter(env: dict) -> Optional[str]:
    value = env.get("RADIO_AUDIO_FILTER")
    if value is None:
        return DEFAULT_RADIO_FILTER
    value = value.strip()
    if value.lower() in ("", "off", "none", "0", "false"):
        return None
    return value
