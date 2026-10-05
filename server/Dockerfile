FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    HUD_TELEMETRY_ENABLED=false \
    HORIZON_DB_PATH=/data/horizon.db

# Dependencies first so source edits don't invalidate the layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

# Tasks files registered from the UI live under /envs (mount it); SQLite under /data.
VOLUME ["/data", "/envs"]
EXPOSE 8000

CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
