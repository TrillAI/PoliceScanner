"""ffmpeg-based audio intake: stream URL or file -> 16 kHz mono PCM."""

import subprocess
from typing import Iterator, List, Optional

import numpy as np

from .segmenter import SAMPLE_RATE

CHUNK_SECONDS = 0.5
_BYTES_PER_SAMPLE = 2  # s16le


def _ffmpeg_args(ffmpeg_bin: str, source: str) -> List[str]:
    args = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-nostdin"]
    if source.startswith(("http://", "https://")):
        # Reconnect if a stream drops mid-broadcast instead of ending the feed.
        args += ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]
    args += ["-i", source, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"]
    return args


def start_decoder(ffmpeg_bin: str, source: str) -> subprocess.Popen:
    return subprocess.Popen(
        _ffmpeg_args(ffmpeg_bin, source),
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


def decode_file(ffmpeg_bin: str, path: str) -> np.ndarray:
    """Decode a whole file to mono 16 kHz float32 (used by the eval tool)."""
    proc = start_decoder(ffmpeg_bin, path)
    chunks = list(iter_chunks(proc, chunk_seconds=10.0))
    err = proc.stderr.read().decode("utf-8", "replace")
    proc.stderr.close()
    proc.wait()
    if proc.returncode not in (0, None):
        raise RuntimeError(f"ffmpeg failed for {path}: {err.strip()}")
    return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
