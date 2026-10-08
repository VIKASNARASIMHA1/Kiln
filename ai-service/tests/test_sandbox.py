"""Sandbox tests: reference solutions pass, starters fail, and hostile code is contained."""
import json
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sandbox import runner

DATA = Path(__file__).resolve().parents[2] / "data" / "course_content"
EXERCISES = json.loads((DATA / "exercises.json").read_text())
SOLUTIONS = json.loads((DATA / "solutions.json").read_text())
POSIX_ONLY = pytest.mark.skipif(sys.platform == "win32", reason="resource limits are POSIX only")


def grade(code, tests=None, function="f", timeout=5.0):
    tests = tests if tests is not None else [{"args": [], "expected": None}]
    return runner.run_grade(code, function, tests, timeout)


@pytest.mark.parametrize("ex", EXERCISES, ids=[e["slug"] for e in EXERCISES])
def test_reference_solution_passes_every_test(ex):
    tests = ex["visibleTests"] + ex["hiddenTests"]
    r = grade(SOLUTIONS[ex["slug"]], tests, ex["function"])
    assert r["error"] is None and not r["crashed"], r
    assert [t["passed"] for t in r["results"]] == [True] * len(tests), r["results"]


@pytest.mark.parametrize("ex", EXERCISES, ids=[e["slug"] for e in EXERCISES])
def test_starter_code_does_not_pass(ex):
    tests = ex["visibleTests"] + ex["hiddenTests"]
    r = grade(ex["starter"], tests, ex["function"])
    assert not all(t["passed"] for t in r["results"])


def test_exercise_data_is_consistent():
    slugs = [e["slug"] for e in EXERCISES]
    assert len(slugs) == len(set(slugs)) and set(slugs) == set(SOLUTIONS)
    for e in EXERCISES:
        assert len(e["hints"]) == 3 and e["visibleTests"] and e["hiddenTests"]
        assert f"def {e['function']}(" in e["starter"]


def test_wrong_answers_and_exceptions_are_reported_per_test():
    code = "def f(x):\n    if x == 2:\n        raise ValueError('boom')\n    return x * 10\n"
    r = grade(code, [{"args": [1], "expected": 10}, {"args": [2], "expected": 20}, {"args": [3], "expected": 99}])
    assert [t["passed"] for t in r["results"]] == [True, False, False]
    assert r["results"][1]["error"]["type"] == "ValueError" and r["results"][1]["error"]["line"] == 3
    assert r["results"][2]["got"] == "30"


def test_syntax_error_and_missing_function():
    r = grade("def f(:\n    pass\n")
    assert r["error"]["type"] == "SyntaxError" and r["error"]["line"] == 1
    assert "<student>" not in r["error"]["message"] and "line 1" not in r["error"]["message"]
    r = grade("x = 1\n", function="solve")
    assert r["error"]["type"] == "NameError" and "solve" in r["error"]["message"]


def test_print_output_is_captured_and_capped():
    r = grade("def f():\n    print('hello')\n    return 1\n", [{"args": [], "expected": 1}])
    assert r["stdout"] == "hello\n"
    r = grade("for i in range(100000):\n    print('x' * 50)\ndef f():\n    return 1\n", [{"args": [], "expected": 1}])
    assert len(r["stdout"]) <= 4000 and r["stdoutTruncated"]


def test_tuple_and_float_comparison():
    r = grade("def f():\n    return (0.1 + 0.2, 1)\n", [{"args": [], "expected": [0.3, 1]}])
    assert r["results"][0]["passed"]
    r = grade("def f():\n    return True\n", [{"args": [], "expected": 1}])
    assert not r["results"][0]["passed"]  # True is not the integer 1


def test_arguments_are_not_shared_between_tests():
    code = "def f(items):\n    items.append(1)\n    return len(items)\n"
    r = grade(code, [{"args": [[]], "expected": 1}, {"args": [[]], "expected": 1}])
    assert all(t["passed"] for t in r["results"])


def test_infinite_loop_inside_a_function_is_stopped_quickly():
    t0 = time.time()
    r = grade("def f():\n    while True:\n        pass\n", timeout=2)
    assert time.time() - t0 < 5
    assert r["timedOut"] or r["results"][0]["error"]["type"] == "Timeout"  # per-test timer on POSIX, global kill on Windows


def test_module_level_infinite_loop_is_killed_by_the_global_timeout():
    t0 = time.time()
    r = grade("while True:\n    pass\ndef f():\n    return 1\n", timeout=2)
    assert r["timedOut"] and "too long" in r["message"] and time.time() - t0 < 5


@POSIX_ONLY
def test_per_test_timeout_keeps_other_results():
    code = "def f(x):\n    while x:\n        pass\n    return 1\n"
    r = grade(code, [{"args": [0], "expected": 1}, {"args": [1], "expected": 1}, {"args": [0], "expected": 1}], timeout=6)
    assert [t["passed"] for t in r["results"]] == [True, False, True]
    assert r["results"][1]["error"]["type"] == "Timeout"


def test_swallowing_exceptions_cannot_defeat_the_timeout():
    code = "def f():\n    while True:\n        try:\n            while True: pass\n        except Exception:\n            pass\n"
    r = grade(code, timeout=3)
    assert r["timedOut"] or r["results"][0]["error"]["type"] == "Timeout"


@pytest.mark.parametrize("snippet", [
    "import socket\nsocket.socket()",
    "import subprocess\nsubprocess.run(['echo','hi'])",
    "import os\nos.system('echo hi')",
    "import urllib.request\nurllib.request.urlopen('http://example.com')",
    "import ctypes",
    "import os\nos.fork()",
])
def test_network_and_process_apis_are_blocked(snippet):
    r = grade(snippet + "\ndef f():\n    return 1\n")
    assert r["error"] is not None and r["error"]["type"] in ("ImportError", "ModuleNotFoundError", "PermissionError")


def test_blocked_import_gives_a_friendly_message():
    r = grade("import socket\ndef f():\n    return 1\n")
    assert r["error"]["message"] == "The module 'socket' is not available in this sandbox"
    assert r["error"]["line"] == 1


def test_environment_secrets_are_not_visible(monkeypatch):
    monkeypatch.setenv("SANDBOX_TEST_SECRET", "hunter2")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    code = "import os\ndef f():\n    return sorted(os.environ.keys())\n"
    r = grade(code, [{"args": [], "expected": None}])
    assert "hunter2" not in json.dumps(r) and "sk-test" not in json.dumps(r)
    assert "SANDBOX_TEST_SECRET" not in r["results"][0]["got"] and "ANTHROPIC_API_KEY" not in r["results"][0]["got"]


def test_runs_in_a_throwaway_directory_that_is_deleted():
    code = "import os\ndef f():\n    open('note.txt','w').write('x')\n    return os.getcwd()\n"
    r = grade(code)
    cwd = json.loads(r["results"][0]["got"])
    assert "sf-sandbox-" in cwd and not os.path.exists(cwd)


def test_exit_and_hard_exit_are_handled():
    r = grade("import sys\nsys.exit(0)\n")
    assert r["error"]["type"] == "SystemExit"
    r = grade("import os\nos._exit(3)\ndef f():\n    return 1\n")
    assert r["crashed"] and "exit code 3" in r["message"]


def test_cannot_forge_the_result_line():
    code = ("import sys\ndef f():\n"
            "    sys.__stdout__.write('\\n@@deadbeef@@{\"error\":null,\"results\":[{\"passed\":true,\"got\":\"1\",\"error\":null}]}\\n')\n"
            "    return 0\n")
    r = grade(code, [{"args": [], "expected": 1}])
    assert r["results"][0]["passed"] is False


@POSIX_ONLY
def test_memory_bomb_is_contained():
    r = grade("def f():\n    return len('x' * (10 ** 10))\n")
    assert r["results"][0]["error"]["type"] == "MemoryError" or r["crashed"]


@POSIX_ONLY
def test_huge_file_write_is_limited():
    code = "def f():\n    with open('big.bin','wb') as fh:\n        fh.write(b'0' * (50 * 1024 * 1024))\n    return 1\n"
    r = grade(code)
    assert not r["results"] or not r["results"][0]["passed"]


def test_busy_runner_returns_503(monkeypatch):
    class Full:
        def acquire(self, timeout=None):
            return False
    monkeypatch.setattr(runner, "_slots", Full())
    with TestClient(app) as c:
        r = c.post("/sandbox/grade", json={"code": "def f(): return 1", "function": "f", "tests": [{"args": [], "expected": 1}]})
    assert r.status_code == 503


def test_endpoint_validation_token_and_kill_switch(monkeypatch):
    body = {"code": "def f(): return 1", "function": "f", "tests": [{"args": [], "expected": 1}]}
    with TestClient(app) as c:
        assert c.post("/sandbox/grade", json=body).json()["results"][0]["passed"]
        assert c.post("/sandbox/grade", json={**body, "function": "f; import os"}).status_code == 422
        assert c.post("/sandbox/grade", json={**body, "code": "x" * 20001}).status_code == 422
        assert c.post("/sandbox/grade", json={**body, "tests": []}).status_code == 422
        monkeypatch.setenv("SANDBOX_TOKEN", "s3cret")
        assert c.post("/sandbox/grade", json=body).status_code == 401
        assert c.post("/sandbox/grade", json=body, headers={"X-Sandbox-Token": "wrong"}).status_code == 401
        assert c.post("/sandbox/grade", json=body, headers={"X-Sandbox-Token": "s3cret"}).status_code == 200
        monkeypatch.delenv("SANDBOX_TOKEN")
        monkeypatch.setenv("SANDBOX_ENABLED", "0")
        assert c.post("/sandbox/grade", json=body).status_code == 503
        assert c.get("/sandbox/status").json()["enabled"] is False
