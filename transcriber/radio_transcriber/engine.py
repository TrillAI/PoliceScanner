"""Speech-to-text engines.

The pipeline only depends on the `SpeechEngine` protocol, which keeps the
model choice out of the rest of the service and lets tests run without
downloading weights.
"""

from typing import Optional, Protocol

import numpy as np

from .filters import Hypothesis


class SpeechEngine(Protocol):
    def transcribe(self, audio: np.ndarray) -> Hypothesis:
        """Transcribe a mono 16 kHz float32 utterance."""
        ...


class FasterWhisperEngine:
    """faster-whisper (CTranslate2) engine tuned for short radio transmissions.

    Settings rationale:
    - condition_on_previous_text=False: each transmission is independent, and
      carrying text forward makes one misheard word repeat across later calls.
    - hotwords biases decoding toward radio vocabulary (ten-codes, "code 3",
      "en route") without the prompt-echo risk of initial_prompt on silence.
    - language fixed to English: the feeds are US English dispatch, and
      auto-detection on short noisy clips often picks the wrong language.
    """

    def __init__(
        self,
        model: str,
        device: str = "auto",
        compute_type: str = "default",
        download_root: Optional[str] = None,
        hotwords: Optional[str] = None,
        beam_size: int = 5,
        cpu_threads: int = 0,
    ):
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            model,
            device=device,
            compute_type=compute_type,
            download_root=download_root,
            cpu_threads=cpu_threads,
        )
        self._hotwords = hotwords or None
        self._beam_size = beam_size

    def transcribe(self, audio: np.ndarray) -> Hypothesis:
        segments, _info = self._model.transcribe(
            audio,
            language="en",
            beam_size=self._beam_size,
            vad_filter=False,  # the segmenter has already isolated speech
            condition_on_previous_text=False,
            without_timestamps=True,
            hotwords=self._hotwords,
            # Pass the no-speech threshold through so the engine can short-circuit
            # silent clips; the filter repeats the check on the aggregate.
            no_speech_threshold=0.6,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
        )
        # Iterate eagerly: faster-whisper returns a lazy generator.
        segs = list(segments)
        if not segs:
            return Hypothesis(text="", avg_logprob=-10.0, no_speech_prob=1.0, compression_ratio=0.0)
        text = " ".join(s.text.strip() for s in segs).strip()
        return Hypothesis(
            text=text,
            # Use the weakest segment: one bad segment should lower trust in the whole utterance.
            avg_logprob=min(s.avg_logprob for s in segs),
            no_speech_prob=max(s.no_speech_prob for s in segs),
            compression_ratio=max(s.compression_ratio for s in segs),
        )
