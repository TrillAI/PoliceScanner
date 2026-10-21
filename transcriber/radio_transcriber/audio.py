"""ffmpeg-based audio intake: stream URL or file -> 16 kHz mono PCM."""

import subprocess
from typing import Iterator, List, Optional

import numpy as np

from .segmenter import SAMPLE_RATE

CHUNK_SECONDS = 0.5
_BYTES_PER_SAMPLE = 2  # s16le

# Police radio is narrowband: almost all speech sits between about 300 Hz and
# 3.4 kHz (the telephone band). Removing energy outside that band takes away
# hum, rumble, and hiss that the recognizer otherwise has to decode around.
# Set RADIO_AUDIO_FILTER=off to decode the raw stream instead.
DEFAULT_RADIO_FILTER = "highpass=f=300,lowpass=f=3400"


def _ffmpeg_args(ffmpeg_bin: str, source: str, audio_filter: Optional[str] = None) -> List[str]:
    args = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-nostdin"]
    if source.startswith(("http://", "https://")):
        # Reconnect if a stream drops mid-broadcast instead of ending the feed.
        args += ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]
    args += ["-i", source, "-vn"]
    if audio_filter:
        args += ["-af", audio_filter]
    args += ["-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"]
    return args


def normalize_peak(audio: np.ndarray, target: float = 0.9, max_gain: float = 10.0) -> np.ndarray:
    """Scale one transmission so its loudest sample sits at `target`.

    Radio levels swing a lot between units, and between a unit keying up near
    the mic and one at the edge of coverage. Leveling each transmission on its
    own gives the recognizer a similar input level every time. Gain is capped
    so that a near-silent segment is not amplified into noise.
    """
    if audio.size == 0:
        return audio
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-3:
        return audio
    gain = min(max_gain, target / peak)
    return np.clip(audio * gain, -1.0, 1.0).astype(np.float32)


def start_decoder(ffmpeg_bin: str, source: str, audio_filter: Optional[str] = None) -> subprocess.Popen:
    return subprocess.Popen(
        _ffmpeg_args(ffmpeg_bin, source, audio_filter),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )


def iter_chunks(proc: subprocess.Popen, chunk_seconds: float = CHUNK_SECONDS) -> Iterator[np.ndarray]:
    """Yield float32 chunks until the decoder exits."""
    want = int(SAMPLE_RATE * chunk_seconds) * _BYTES_PER_SAMPLE
    stream = proc.stdout
    try:
        while True:
            raw = _read_exact(stream, want)
            if not raw:
                return
            usable = len(raw) - (len(raw) % _BYTES_PER_SAMPLE)
            if usable == 0:
                return
            pcm = np.frombuffer(raw[:usable], dtype="<i2")
            yield pcm.astype(np.float32) / 32768.0
            if len(raw) < want:
                return
    finally:
        stream.close()


def _read_exact(stream, n: int) -> bytes:
    parts = []
    remaining = n
    while remaining > 0:
        piece = stream.read(remaining)
        if not piece:
            break
        parts.append(piece)
        remaining -= len(piece)
    return b"".join(parts)


def decode_file(ffmpeg_bin: str, path: str, audio_filter: Optional[str] = None) -> np.ndarray:
    """Decode a whole file to mono 16 kHz float32 (used by the eval tool)."""
    proc = start_decoder(ffmpeg_bin, path, audio_filter)
    chunks = list(iter_chunks(proc, chunk_seconds=10.0))
    err = proc.stderr.read().decode("utf-8", "replace")
    proc.stderr.close()
    proc.wait()
    if proc.returncode not in (0, None):
        raise RuntimeError(f"ffmpeg failed for {path}: {err.strip()}")
    return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
