"""Runs INSIDE the sandbox child process (never imported by the API).

Reads one JSON request on stdin, applies resource limits, blocks risky modules, runs the learner's
code, then writes a single JSON result line tagged with a secret nonce on the real stdout.

Only the standard library is used. This is defense in depth, NOT a hard security boundary:
for untrusted public traffic, run the whole ai-service in a locked-down container.
"""
import copy
import json
import math
import os
import re
import signal
import sys
import traceback

BLOCKED_MODULES = (
    "subprocess", "_posixsubprocess", "socket", "_socket", "ssl", "ctypes", "_ctypes", "multiprocessing",
    "pty", "webbrowser", "http", "urllib", "ftplib", "smtplib", "telnetlib", "xmlrpc", "socketserver",
)
BLOCKED_OS_FUNCTIONS = (
    "system", "popen", "execl", "execle", "execlp", "execlpe", "execv", "execve", "execvp", "execvpe",
    "spawnl", "spawnle", "spawnlp", "spawnlpe", "spawnv", "spawnve", "spawnvp", "spawnvpe",
    "fork", "forkpty", "posix_spawn", "posix_spawnp", "kill", "killpg", "startfile",
)


class Capped:
    """File-like object that keeps at most `cap` characters of output."""

    def __init__(self, cap):
        self.cap, self.size, self.parts, self.truncated = cap, 0, [], False

    def write(self, s):
        s = s if isinstance(s, str) else str(s)
        n = len(s)
        room = self.cap - self.size
        if room <= 0:
            self.truncated = True
            return n
        if n > room:
            s, self.truncated = s[:room], True
        self.parts.append(s)
        self.size += len(s)
        return n

    def flush(self):
        pass

    def isatty(self):
        return False

    def writable(self):
        return True

    def getvalue(self):
        return "".join(self.parts)


class TestTimeout(BaseException):
    """BaseException so a learner's `except Exception:` cannot swallow it."""


def apply_limits(lim):
    try:
        import resource
    except ImportError:  # Windows: only the parent's wall-clock timeout applies
        return False

    def cap(name, value):
        try:
            res = getattr(resource, name)
            _, hard = resource.getrlimit(res)
            v = value if hard == resource.RLIM_INFINITY else min(value, hard)
            resource.setrlimit(res, (v, v))  # lowering the hard limit too makes it irreversible
        except (ValueError, OSError, AttributeError):
            pass

    cap("RLIMIT_CPU", int(lim["cpu_s"]))
    cap("RLIMIT_AS", int(lim["mem_mb"]) * 1024 * 1024)
    cap("RLIMIT_FSIZE", int(lim["fsize_mb"]) * 1024 * 1024)
    cap("RLIMIT_CORE", 0)
    return True


def lock_down():
    for name in BLOCKED_MODULES:
        sys.modules[name] = None  # `import name` now raises ImportError

    def deny(*_a, **_k):
        raise PermissionError("This operation is not allowed in the sandbox")

    for fn in BLOCKED_OS_FUNCTIONS:
        if hasattr(os, fn):
            setattr(os, fn, deny)


def describe(exc):
    line = getattr(exc, "lineno", None) if isinstance(exc, SyntaxError) else None
    if line is None:
        frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "<student>"]
        line = frames[-1].lineno if frames else None
    message = str(exc)
    if isinstance(exc, ImportError) and "None in sys.modules" in message:
        message = f"The module '{getattr(exc, 'name', None) or 'this'}' is not available in this sandbox"
    message = re.sub(r"\s*\(<student>, line \d+\)", "", message)  # the line number is reported separately
    return {"type": type(exc).__name__, "message": message[:300], "line": line}


def normalise(value):
    try:
        return json.loads(json.dumps(value))  # tuples -> lists, int keys -> str keys
    except (TypeError, ValueError):
        return repr(value)


def same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b


def short(value):
    text = json.dumps(value)
    return text if len(text) <= 200 else text[:197] + "..."


def run_tests(fn, tests, per_test):
    can_alarm = hasattr(signal, "setitimer")
    if can_alarm:
        def on_alarm(_s, _f):
            raise TestTimeout()
        signal.signal(signal.SIGALRM, on_alarm)
    results = []
    for t in tests:
        item = {"passed": False, "got": None, "error": None}
        try:
            if can_alarm:
                signal.setitimer(signal.ITIMER_REAL, per_test)
            try:
                got = fn(*copy.deepcopy(t.get("args", [])))
            finally:
                if can_alarm:
                    signal.setitimer(signal.ITIMER_REAL, 0)
            got = normalise(got)
            item["got"] = short(got)
            item["passed"] = same(got, normalise(t.get("expected")))
        except TestTimeout:
            item["error"] = {"type": "Timeout", "message": "This test took too long (possible infinite loop)", "line": None}
        except Exception as exc:  # noqa: BLE001 - learner code can raise anything
            item["error"] = describe(exc)
        results.append(item)
    return results


def main():
    real_out = sys.stdout.buffer
    req = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    limits_enforced = apply_limits(req["limits"])
    out = Capped(req.get("max_output", 4000))
    result = {"error": None, "results": [], "limitsEnforced": limits_enforced}

    sys.stdout = sys.stderr = out
    lock_down()
    ns = {"__name__": "__student__", "__builtins__": __builtins__}
    try:
        exec(compile(req["code"], "<student>", "exec"), ns)
        name = req.get("function")
        if name:
            fn = ns.get(name)
            if not callable(fn):
                result["error"] = {"type": "NameError", "message": f"Define a function named {name}", "line": None}
            else:
                result["results"] = run_tests(fn, req.get("tests", []), req.get("per_test", 2.0))
    except SystemExit:
        result["error"] = {"type": "SystemExit", "message": "Your code called exit(); remove it", "line": None}
    except BaseException as exc:  # noqa: BLE001
        result["error"] = describe(exc)
    sys.stdout = sys.stderr = None
    result["stdout"], result["stdoutTruncated"] = out.getvalue(), out.truncated

    line = "\n@@" + req["nonce"] + "@@" + json.dumps(result) + "\n"
    real_out.write(line.encode("ascii"))
    real_out.flush()
    os._exit(0)  # skip atexit hooks the learner may have registered


if __name__ == "__main__":
    main()
