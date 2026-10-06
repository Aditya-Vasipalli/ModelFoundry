FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application code (see .dockerignore)
COPY . .
RUN chmod +x start.sh && mkdir -p cached_models

EXPOSE 8000

# Default: API + worker in one container (for single-container hosts).
# docker-compose.yml runs them as separate services instead.
CMD ["./start.sh"]
