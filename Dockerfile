FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Run as an unprivileged user
RUN useradd --create-home --uid 10001 app

# Copy application code (see .dockerignore)
COPY --chown=app:app . .
RUN chmod +x start.sh && mkdir -p cached_models temp_models && chown -R app:app /app

USER app
EXPOSE 8000

# Default: API + worker in one container (for single-container hosts).
# docker-compose.yml runs them as separate services instead.
CMD ["./start.sh"]
