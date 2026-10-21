# Live radio transcriber: one process, one model, one worker.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_DIR=/models

WORKDIR /srv/transcriber

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY radio_transcriber ./radio_transcriber

# Model weights are fetched on first start into the mounted volume, then reused.
VOLUME ["/models"]

# Feed config (stream URLs) is mounted at runtime, never baked into the image.
ENV FEEDS_FILE=/config/feeds.json

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=300s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=4).status==200 else 1)"

# Keep --workers 1: the model and the feed threads live in this process.
CMD ["uvicorn", "radio_transcriber.app:get_app", "--factory", "--host", "0.0.0.0", "--port", "8787", "--workers", "1", "--proxy-headers"]
