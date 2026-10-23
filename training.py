"""
training.py — runs one training job in an isolated child process.

The child reads the CSV, trains and saves the model, and streams progress back.
The parent enforces a time limit, notices crashes (e.g. the OS killing the child
for using too much memory) and can stop the child when a job is cancelled, so a
bad dataset never takes the worker down with it.
"""

import csv
import multiprocessing as mp
import queue
import time
from dataclasses import dataclass
from typing import Callable, Optional

import pandas as pd

MAX_ROWS = 1_000_000


def read_dataset(path: str) -> pd.DataFrame:
    """Reads a CSV, detecting the delimiter (, ; tab |) and tolerating BOMs / non-UTF8 files."""
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            with open(path, newline="", encoding=encoding) as f:
                sample = f.read(64 * 1024)
            try:
                sep = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
            except csv.Error:
                sep = ","
            df = pd.read_csv(path, sep=sep, encoding=encoding, low_memory=False)
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not read the file as CSV text.")


def _child(out: "mp.Queue", dataset_path, target_column, model_type, job_id, options, save_dir):
    # Imported here so the parent process stays light
    from model import train_and_evaluate

    def progress(stage, message, percent):
        out.put(("progress", {"stage": stage, "message": message, "percent": int(percent)}))

    try:
        progress("loading", "Reading the dataset", 5)
        try:
            df = read_dataset(dataset_path)
        except pd.errors.ParserError as e:
            raise ValueError(f"The file isn't a valid CSV: {e}")
        if df.empty:
            raise ValueError("The file has no data rows.")
        if len(df) > MAX_ROWS:
            raise ValueError(f"Datasets can have at most {MAX_ROWS:,} rows (this one has {len(df):,}).")
        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found in dataset.")
        if df.shape[1] < 2:
            raise ValueError("The dataset needs at least one feature column besides the target.")

        y = df[target_column]
        X = df.drop(columns=[target_column])
        out.put(("done", train_and_evaluate(X, y, model_type, job_id, save_dir=save_dir,
                                            options=options, progress=progress)))
    except (ValueError, UnicodeDecodeError) as e:
        out.put(("user_error", str(e)))
    except MemoryError:
        out.put(("user_error", "The dataset is too large to train on this machine."))
    except Exception as e:  # unexpected: may be transient, the worker decides whether to retry
        out.put(("error", f"{type(e).__name__}: {e}"))


@dataclass
class TrainingOutcome:
    kind: str  # done | user_error | error | timeout | cancelled
    message: str = ""
    result: Optional[tuple] = None


def run_training(
    dataset_path: str,
    target_column: str,
    model_type: str,
    job_id: str,
    options: dict,
    save_dir: str = "./temp_models",
    timeout: float = 900,
    on_progress: Callable[[dict], None] = lambda p: None,
    should_cancel: Callable[[], bool] = lambda: False,
    on_tick: Callable[[], None] = lambda: None,
) -> TrainingOutcome:
    ctx = mp.get_context("spawn")
    out = ctx.Queue()
    proc = ctx.Process(
        target=_child,
        args=(out, dataset_path, target_column, model_type, job_id, options, save_dir),
        daemon=True,
    )
    proc.start()
    deadline = time.time() + timeout
    last_cancel_check = 0.0

    try:
        while True:
            on_tick()
            try:
                kind, payload = out.get(timeout=1)
            except queue.Empty:
                if not proc.is_alive():
                    code = proc.exitcode
                    if code is not None and code < 0:  # killed by a signal, usually out of memory
                        return TrainingOutcome("user_error", "Training ran out of memory. Try a smaller dataset "
                                                             "or a lighter model such as Logistic or Ridge Regression.")
                    return TrainingOutcome("error", f"Training process exited unexpectedly (code {code}).")
                if time.time() > deadline:
                    return TrainingOutcome("timeout", f"Training took longer than {int(timeout // 60)} minutes "
                                                      "and was stopped. Try a faster model or a smaller dataset.")
                if time.time() - last_cancel_check > 3:
                    last_cancel_check = time.time()
                    if should_cancel():
                        return TrainingOutcome("cancelled", "Cancelled by the user.")
                continue

            if kind == "progress":
                on_progress(payload)
            elif kind == "done":
                return TrainingOutcome("done", result=payload)
            else:
                return TrainingOutcome(kind, message=payload)
    finally:
        if proc.is_alive():
            proc.terminate()
        proc.join(timeout=5)
        out.close()
