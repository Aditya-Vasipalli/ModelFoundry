#!/bin/bash

# Start the ML Worker in the background, output to stdout/stderr
python -u worker.py 2>&1 &
WORKER_PID=$!
echo "Worker started with PID $WORKER_PID"

# Start the FastAPI application in the foreground
uvicorn main:app --host 0.0.0.0 --port 8000
