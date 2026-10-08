"""Spawns the sandbox harness in a separate, resource-limited process and parses its result."""
from __future__ import annotations

import json
import math
import os
import secrets
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HARNESS = Path(__file__).with_name("harness.py")
MAX_CONCURRENT = int(os.getenv("SANDBOX_MAX_CONCURRENT", "4"))
_slots = threading.BoundedSemaphore(MAX_CONCURRENT)
MAX_CODE_CHARS = 20_000


class SandboxBusy(Exception):
    """Too many runs at once; the caller should retry shortly."""


def limits_enforced() -> bool:
    try:
        import resource  # noqa: F401
        return True
    except ImportError:
        return False


def _minimal_env() -> dict:
    # Nothing from the parent environment is passed on, so learner code cannot read API keys or secrets.
    env = {"PYTHONHASHSEED": "0"}
    for key in ("SYSTEMROOT", "SYSTEMDRIVE", "WINDIR"):  # Python will not start on Windows without these
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def _python() -> str:
    # On Windows a venv's python.exe is a launcher that starts the real interpreter as a child process,
    # so killing it on timeout could leave the learner's loop running. Use the real interpreter directly
    # (the harness needs only the standard library).
    if sys.platform == "win32":
        return getattr(sys, "_base_executable", None) or sys.executable
    return sys.executable


def _kill(proc: subprocess.Popen) -> None:
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=5)
            proc.kill()
    except (ProcessLookupError, PermissionError, OSError, subprocess.SubprocessError):
        pass


def _tail(path: Path, n: int = 262_144) -> str:
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - n))
        return f.read().decode("utf-8", "replace")


def run_grade(code: str, function: str, tests: list[dict], timeout: float = 5.0) -> dict:
    if len(code) > MAX_CODE_CHARS:
        raise ValueError("Code is too long")
    if not _slots.acquire(timeout=2):
        raise SandboxBusy()
    try:
        return _execute(code, function, tests, timeout)
    finally:
        _slots.release()


def _execute(code: str, function: str, tests: list[dict], timeout: float) -> dict:
    nonce = secrets.token_hex(12)
    request = {
        "nonce": nonce,
        "code": code,
        "function": function,
        "tests": tests,
        "per_test": max(0.5, min(2.0, timeout / 2)),
        "max_output": 4000,
        "limits": {"cpu_s": math.ceil(timeout) + 1, "mem_mb": 512, "fsize_mb": 1},
    }
    started = time.perf_counter()
    timed_out = False
    with tempfile.TemporaryDirectory(prefix="sf-sandbox-") as tmp:
        out_path, err_path = Path(tmp, ".out"), Path(tmp, ".err")
        with open(out_path, "wb") as fo, open(err_path, "wb") as fe:
            kwargs = dict(stdin=subprocess.PIPE, stdout=fo, stderr=fe, cwd=tmp, env=_minimal_env(), close_fds=True)
            if os.name == "posix":
                kwargs["start_new_session"] = True  # lets us kill the whole process group on timeout
            proc = subprocess.Popen([_python(), "-I", str(HARNESS)], **kwargs)
            try:
                proc.communicate(json.dumps(request).encode("utf-8"), timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                _kill(proc)
                proc.communicate()
        duration_ms = int((time.perf_counter() - started) * 1000)
        stdout, stderr = _tail(out_path), _tail(err_path, 2000)

    base = {"timedOut": timed_out, "durationMs": duration_ms, "exitCode": proc.returncode}
    if timed_out:
        return {**base, "crashed": False, "error": None, "results": [], "stdout": "", "stdoutTruncated": False,
                "message": "Your code took too long to run (possible infinite loop)."}

    marker = f"@@{nonce}@@"
    idx = stdout.rfind(marker)
    if idx != -1:
        try:
            parsed = json.loads(stdout[idx + len(marker):].split("\n", 1)[0])
            return {**base, "crashed": False, "message": None, **parsed}
        except json.JSONDecodeError:
            pass
    reason = "ran out of memory or was stopped" if (proc.returncode or 0) < 0 else "ended unexpectedly"
    return {**base, "crashed": True, "error": None, "results": [], "stdout": "", "stdoutTruncated": False,
            "message": f"Your program {reason} (exit code {proc.returncode}).", "stderr": stderr[-500:]}
