#!/bin/bash

# Start the ML Worker in the background
python worker.py &
WORKER_PID=$!

# Start the FastAPI application in the foreground
uvicorn main:app --host 0.0.0.0 --port 8000
