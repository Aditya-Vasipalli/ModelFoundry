#!/bin/bash
# Runs the API and the training worker in one container.
# (docker compose runs them as separate services and doesn't use this script.)

python -u worker.py &
echo "Worker started with PID $!"

exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
