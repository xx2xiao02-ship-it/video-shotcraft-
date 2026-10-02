"""Start Video ShotCraft without making Node spawn PowerShell for DPAPI."""
import base64
import ctypes
import ctypes.wintypes as wintypes
import json
import os
import subprocess
import sys
import socket
import time
from pathlib import Path


class DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def unprotect(value: str) -> str:
    raw = base64.b64decode(value)
    source = (ctypes.c_byte * len(raw)).from_buffer_copy(raw)
    source_blob = DataBlob(len(raw), ctypes.cast(source, ctypes.POINTER(ctypes.c_byte)))
    result_blob = DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(source_blob), None, None, None, None, 0, ctypes.byref(result_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(result_blob.pbData, result_blob.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(result_blob.pbData)


def main() -> int:
    root = Path(__file__).resolve().parent
    local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    config_path = local_app_data / "VideoShotCraft" / "a-mode-ark-config.dpapi.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    public = config.get("public", {})
    secret = config.get("secret")
    if not secret:
        raise RuntimeError("未找到 A 模式方舟 API Key 配置")
    env = os.environ.copy()
    env.update({
        "A_MODE_ARK_API_KEY": unprotect(secret),
        "A_MODE_ARK_PRO_MODEL": str(public.get("proEndpoint", "")),
        "A_MODE_ARK_TURBO_MODEL": str(public.get("turboEndpoint", "")),
        "A_MODE_GLOBAL_MODEL": str(public.get("globalModel", "pro")),
        "A_MODE_SHOT_MODEL": str(public.get("shotModel", "turbo")),
    })
    env.setdefault("PORT", "8769")
    supervisor = subprocess.Popen([sys.executable, str(root / "director" / "a-mode-supervisor.py")],
                                  cwd=root, env=env)
    try:
        # Do not expose the console before the local bridge is accepting connections.
        for _ in range(50):
            try:
                with socket.create_connection(("127.0.0.1", int(env.get("A_MODE_SUPERVISOR_PORT", "8772"))), timeout=0.1):
                    break
            except OSError:
                time.sleep(0.1)
        return subprocess.call(["node", "console-server.mjs"], cwd=root, env=env)
    finally:
        supervisor.terminate()
        supervisor.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
