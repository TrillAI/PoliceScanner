import unittest

import numpy as np
from fastapi.testclient import TestClient

from radio_transcriber.config import Feed, Settings
from radio_transcriber.app import create_app
from radio_transcriber.filters import Hypothesis, FilterSettings


class StubEngine:
    def __init__(self, text):
        self.text = text

    def transcribe(self, audio):
        return Hypothesis(text=self.text, avg_logprob=-0.2, no_speech_prob=0.01, compression_ratio=1.1)


def make_settings(token=None):
    return Settings(
        feeds=[Feed(id="sfpd", url="https://example.com/stream")],
        token=token,
        ffmpeg_bin="ffmpeg",
        filters=FilterSettings(),
    )


class ApiTests(unittest.TestCase):
    def client(self, token=None):
        app = create_app(settings=make_settings(token), engine=StubEngine("Unit 4 copy 10-4"), start_workers=False)
        return TestClient(app)

    def test_health_and_feed_list_hide_stream_urls(self):
        with self.client() as c:
            self.assertEqual(c.get("/health").status_code, 200)
            body = c.get("/feeds").json()
            self.assertEqual(body["feeds"][0]["id"], "sfpd")
            self.assertNotIn("url", str(body))

    def test_first_poll_without_cursor_returns_no_backlog(self):
        app = create_app(settings=make_settings(), engine=StubEngine("x"), start_workers=False)
        with TestClient(app) as c:
            # Records already in the store before the client starts listening.
            store = app.state.store
            store.add("sfpd", started_at=1.0, duration_s=1.0, text="old", normalized="old", confidence=0.9)
            body = c.get("/feeds/sfpd/transcripts").json()
            self.assertEqual(body["segments"], [])
            self.assertEqual(body["latest"], 1)

    def test_incremental_polling_returns_only_new_records(self):
        app = create_app(settings=make_settings(), engine=StubEngine("x"), start_workers=False)
        with TestClient(app) as c:
            store = app.state.store
            cursor = c.get("/feeds/sfpd/transcripts").json()["latest"]
            store.add("sfpd", started_at=2.0, duration_s=1.0, text="Unit 4 copy 10-4", normalized="unit 4 copy 10-4", confidence=0.9)
            body = c.get(f"/feeds/sfpd/transcripts?after={cursor}").json()
            self.assertEqual([s["seq"] for s in body["segments"]], [cursor + 1])
            self.assertEqual(body["segments"][0]["normalized"], "unit 4 copy 10-4")
            again = c.get(f"/feeds/sfpd/transcripts?after={body['latest']}").json()
            self.assertEqual(again["segments"], [])

    def test_unknown_feed_is_404(self):
        with self.client() as c:
            self.assertEqual(c.get("/feeds/nope/transcripts").status_code, 404)

    def test_token_is_enforced_when_configured(self):
        with self.client(token="s3cret") as c:
            self.assertEqual(c.get("/feeds").status_code, 401)
            self.assertEqual(c.get("/feeds", headers={"Authorization": "Bearer wrong"}).status_code, 401)
            self.assertEqual(c.get("/feeds", headers={"Authorization": "Bearer s3cret"}).status_code, 200)
            # Health stays open so load balancers can probe it without the token.
            self.assertEqual(c.get("/health").status_code, 200)




if __name__ == "__main__":
    unittest.main()
