"""HTTP API consumed by the mobile/web app.

GET /health                                 service and per-feed status
GET /feeds                                  feed ids and status (no stream URLs)
GET /feeds/{id}/transcripts?after=SEQ       transcripts with seq > SEQ
  - Without `after`, returns no records and the current cursor, so a client
    that starts listening now does not replay old traffic as new alerts.
"""

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .engine import FasterWhisperEngine, SpeechEngine
from .pipeline import FeedStatus, FeedWorker, TranscriptStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(
    settings: Optional[Settings] = None,
    engine: Optional[SpeechEngine] = None,
    start_workers: bool = True,
    segmenter_factory=None,
) -> FastAPI:
    settings = settings or load_settings()
    store = TranscriptStore(settings.history_size)
    statuses = {f.id: FeedStatus() for f in settings.feeds}
    state = {"engine": engine, "workers": []}
    engine_lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if state["engine"] is None:
            # Model load is slow (seconds to minutes on first run); do it before serving.
            state["engine"] = FasterWhisperEngine(
                model=settings.model,
                device=settings.device,
                compute_type=settings.compute_type,
                download_root=settings.model_dir,
                hotwords=settings.hotwords,
            )
        if start_workers:
            for feed in settings.feeds:
                worker = FeedWorker(
                    feed,
                    settings,
                    state["engine"],
                    engine_lock,
                    store,
                    statuses[feed.id],
                    segmenter_factory=segmenter_factory,
                )
                worker.start()
                state["workers"].append(worker)
        yield
        for worker in state["workers"]:
            worker.stop()

    app = FastAPI(title="Radio transcriber", lifespan=lifespan)
    app.state.store = store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Authorization"],
    )

    def require_token(authorization: Optional[str] = Header(default=None)) -> None:
        if not settings.token:
            return
        expected = f"Bearer {settings.token}"
        if not authorization or not hmac.compare_digest(authorization, expected):
            raise HTTPException(status_code=401, detail="invalid or missing token")

    def _feed_or_404(feed_id: str):
        if feed_id not in statuses:
            raise HTTPException(status_code=404, detail="unknown feed")
        return statuses[feed_id]

    @app.get("/health")
    def health():
        return {
            "ok": True,
            "model": settings.model,
            "feeds": {fid: _status_json(st) for fid, st in statuses.items()},
        }

    @app.get("/feeds", dependencies=[Depends(require_token)])
    def feeds():
        return {
            "feeds": [
                {"id": fid, **_status_json(st)} for fid, st in statuses.items()
            ]
        }

    @app.get("/feeds/{feed_id}/transcripts", dependencies=[Depends(require_token)])
    def transcripts(feed_id: str, after: Optional[int] = Query(default=None, ge=0), limit: int = Query(default=200, ge=1, le=500)):
        _feed_or_404(feed_id)
        latest = store.latest_seq(feed_id)
        if after is None:
            return {"segments": [], "latest": latest}
        records = store.after(feed_id, after, limit=limit)
        return {
            "segments": [
                {
                    "seq": r.seq,
                    "feedId": r.feed_id,
                    "startedAt": r.started_at,
                    "durationS": r.duration_s,
                    "text": r.text,
                    "normalized": r.normalized,
                    "confidence": r.confidence,
                }
                for r in records
            ],
            "latest": latest,
        }

    return app


def _status_json(st: FeedStatus) -> dict:
    return {
        "state": st.state,
        "lastSegmentAt": st.last_segment_at,
        "lastError": st.last_error,
        "dropped": dict(st.dropped),
    }


def get_app() -> FastAPI:
    """Entry point for uvicorn: `uvicorn radio_transcriber.app:get_app --factory`."""
    return create_app()
