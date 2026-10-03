"""A-mode process bridge.

The Windows desktop sandbox can reject child processes created by Node with
EPERM.  This tiny Python supervisor is intentionally boring: Python starts the
Node worker, while the worker keeps the existing model/API contract.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = int(os.environ.get("A_MODE_SUPERVISOR_PORT", "8772"))


def run_worker(payload: dict) -> dict:
    run_id = str(payload.get("runId", ""))
    if not run_id or any(ch not in "0123456789abcdef-" for ch in run_id.lower()):
        raise ValueError("无效的 A 模式任务 ID")
    resume = bool(payload.get("resumeDirector"))
    run_dir = ROOT / "director" / "a-mode-runs" / run_id
    if not run_dir.is_dir():
        raise ValueError("A 模式任务目录不存在")
    env = os.environ.copy()
    env["SHOTCRAFT_ROOT"] = str(ROOT)
    commands = []
    if payload.get("kind") == "render":
        env.update({str(k): str(v) for k, v in (payload.get("env") or {}).items()})
        commands.append(["node", str(ROOT / "director" / "render.mjs")])
        return _run_commands(commands, env)
    if not resume:
        voice = str(payload.get("voice") or "").strip()
        input_file = run_dir / "input.json"
        speech_rate = json.loads(input_file.read_text(encoding="utf-8")).get("speechRate", 0) if input_file.exists() else 0
        if not voice and input_file.exists():
            try:
                voice = str(json.loads(input_file.read_text(encoding="utf-8")).get("voice") or "")
            except Exception:
                pass
        audio = ROOT / "template" / "public" / "audio" / "a-mode" / f"{run_id}.mp3"
        timing = run_dir / "timing.json"
        tts = [sys.executable, str(ROOT / "director" / "b-mode-tts.py"),
               str(run_dir / "script.txt"), str(audio), str(timing),
               "--voice", voice, "--rate", str(speech_rate), "--max-chars", "1200", "--preserve-sentences"]
        commands.append(tts)
    commands.append(["node", str(ROOT / "director" / "a-mode-run.mjs"), run_id,
                     "--resume-director"])
    return _run_commands(commands, env)


def _run_commands(commands, env):
    output = []
    for command in commands:
        completed = subprocess.run(command, cwd=ROOT, env=env, text=True,
                                   capture_output=True, encoding="utf-8", errors="replace")
        output.append(completed.stdout or "")
        output.append(completed.stderr or "")
        if completed.returncode != 0:
            return {"ok": False, "exitCode": completed.returncode,
                    "stdout": "".join(output), "stderr": ""}
    return {"ok": True, "exitCode": 0, "stdout": "".join(output), "stderr": ""}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        if self.path not in ("/run", "/render"):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(size) or b"{}")
            if self.path == "/render":
                payload["kind"] = "render"
            result = run_worker(payload)
            body = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"ok": False, "exitCode": None,
                               "error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
