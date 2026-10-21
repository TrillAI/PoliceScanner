"""Measure transcription accuracy on your own recorded radio clips.

Manifest format (TSV, one clip per line, '#' lines ignored):

    clips/unit4_10-4.wav<TAB>Unit 4 copy 10-4
    clips/shots_fired.mp3<TAB>Shots fired at Broadway and 5th

Each clip runs through the same path as the live service: decode, segment
into transmissions, transcribe, apply the hallucination filters. The reported
word error rate compares normalized text, so "ten four" and "10-4" count as
the same word.

    python -m radio_transcriber.eval clips.tsv --model small.en --device cpu
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from .audio import DEFAULT_RADIO_FILTER, decode_file, normalize_peak
from .config import DEFAULT_HOTWORDS, _default_ffmpeg
from .filters import FilterSettings, judge
from .normalize import normalize_radio_transcript
from .segmenter import SAMPLE_RATE, UtteranceSegmenter


def _normalize_for_scoring(text: str) -> List[str]:
    cleaned = normalize_radio_transcript(text)
    cleaned = re.sub(r"[^a-z0-9\- ]", " ", cleaned)
    return cleaned.split()


def word_edit_distance(ref: List[str], hyp: List[str]) -> int:
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cost = 0 if r == h else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[-1]


@dataclass
class ClipResult:
    path: str
    reference: str
    hypothesis: str
    errors: int
    ref_words: int
    dropped: List[str]


def transcribe_clip(
    engine,
    ffmpeg_bin: str,
    path: str,
    filters: FilterSettings,
    silence_ms: int,
    audio_filter: Optional[str] = None,
    peak_normalize: bool = True,
    min_utterance_s: float = 0.3,
):
    """Run one clip through the same steps as the live service."""
    pcm = decode_file(ffmpeg_bin, path, audio_filter)
    segmenter = UtteranceSegmenter(silence_ms=silence_ms, min_utterance_s=min_utterance_s)
    utterances = []
    step = SAMPLE_RATE // 2
    for pos in range(0, len(pcm), step):
        utterances.extend(segmenter.push(pcm[pos:pos + step]))
    utterances.extend(segmenter.flush())

    kept, dropped = [], []
    for utt in utterances:
        audio_in = normalize_peak(utt.audio) if peak_normalize else utt.audio
        hyp = engine.transcribe(audio_in)
        reason = judge(hyp, filters)
        if reason is None:
            kept.append(hyp.text.strip())
        else:
            dropped.append(reason)
    return " ".join(kept), dropped


def read_manifest(path: str):
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            clip, _, reference = line.partition("\t")
            if not reference:
                raise ValueError(f"manifest line missing reference text: {line!r}")
            rows.append((clip, reference.strip()))
    return rows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="default")
    parser.add_argument("--model-dir", default=None)
    parser.add_argument("--hotwords", default=None)
    parser.add_argument("--silence-ms", type=int, default=600)
    parser.add_argument("--min-utterance-s", type=float, default=0.3)
    parser.add_argument(
        "--audio-filter",
        default=DEFAULT_RADIO_FILTER,
        help="ffmpeg audio filter applied before decoding; 'off' disables (default: %(default)s)",
    )
    parser.add_argument(
        "--no-peak-normalize",
        action="store_true",
        help="skip per-transmission level normalization",
    )
    parser.add_argument("--ffmpeg", default=None)
    parser.add_argument("--json", default=None, help="write per-clip results to this file")
    args = parser.parse_args(argv)

    from .engine import FasterWhisperEngine

    engine = FasterWhisperEngine(
        model=args.model,
        device=args.device,
        compute_type=args.compute_type,
        download_root=args.model_dir,
        hotwords=args.hotwords or DEFAULT_HOTWORDS,
    )
    ffmpeg_bin = args.ffmpeg or _default_ffmpeg()
    filters = FilterSettings()
    audio_filter = None if args.audio_filter.strip().lower() in ("", "off", "none") else args.audio_filter

    results: List[ClipResult] = []
    for clip, reference in read_manifest(args.manifest):
        hypothesis, dropped = transcribe_clip(
            engine,
            ffmpeg_bin,
            clip,
            filters,
            args.silence_ms,
            audio_filter=audio_filter,
            peak_normalize=not args.no_peak_normalize,
            min_utterance_s=args.min_utterance_s,
        )
        ref_tokens = _normalize_for_scoring(reference)
        hyp_tokens = _normalize_for_scoring(hypothesis)
        errors = word_edit_distance(ref_tokens, hyp_tokens)
        results.append(ClipResult(clip, reference, hypothesis, errors, len(ref_tokens), dropped))
        wer = errors / max(1, len(ref_tokens))
        print(f"WER {wer:6.1%}  {clip}")
        print(f"   ref: {reference}")
        print(f"   hyp: {hypothesis or '(nothing)'}")
        if dropped:
            print(f"   dropped: {', '.join(dropped)}")

    total_errors = sum(r.errors for r in results)
    total_words = sum(r.ref_words for r in results)
    if total_words == 0:
        print("no reference words found", file=sys.stderr)
        return 1
    print(f"\nclips: {len(results)}  reference words: {total_words}  overall WER: {total_errors / total_words:.1%}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "model": args.model,
                    "overall_wer": total_errors / total_words,
                    "clips": [r.__dict__ for r in results],
                },
                fh,
                indent=2,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
