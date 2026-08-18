"""
FastAPI Reverse Proxy — bootstraps the Node.js Express backend and forwards all
/api requests to it. The supervisor process starts uvicorn (READONLY config),
so we tunnel Node behind FastAPI to satisfy the "Node.js + Express" tech stack
requirement while remaining supervisor-compatible.
"""
import os
import atexit
import shutil
import signal
import subprocess
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware


NODE_HOST = "127.0.0.1"
NODE_PORT = int(os.environ.get("NODE_PORT", "8002"))
NODE_URL = f"http://{NODE_HOST}:{NODE_PORT}"
BACKEND_NODE_DIR = Path("/app/backend-node")


def _ensure_postgres_and_redis():
    """Best-effort start of PG cluster + Redis if not already running."""
    try:
        subprocess.run(
            ["pg_isready", "-h", "127.0.0.1", "-p", "5432"],
            check=True, capture_output=True, timeout=5,
        )
    except Exception:
        subprocess.run(
            ["pg_ctlcluster", "15", "main", "start"],
            capture_output=True,
        )
    try:
        subprocess.run(["redis-cli", "ping"], check=True, capture_output=True, timeout=3)
    except Exception:
        subprocess.run(["redis-server", "--daemonize", "yes", "--port", "6379"], capture_output=True)


_node_proc: subprocess.Popen | None = None


def _spawn_node_backend():
    global _node_proc
    if _node_proc and _node_proc.poll() is None:
        return
    node_bin = shutil.which("node") or "/usr/bin/node"
    _node_proc = subprocess.Popen(
        [node_bin, "src/server.js"],
        cwd=str(BACKEND_NODE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ},
        preexec_fn=os.setsid,
    )
    # Pipe Node stdout into uvicorn's log stream in a background thread.
    import threading

    def _pump():
        assert _node_proc is not None and _node_proc.stdout is not None
        for line in _node_proc.stdout:
            print(f"[node] {line.decode(errors='ignore').rstrip()}", flush=True)

    threading.Thread(target=_pump, daemon=True).start()


def _wait_for_node(timeout: float = 30.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = httpx.get(f"{NODE_URL}/api/health", timeout=1.5)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


@atexit.register
def _cleanup():
    global _node_proc
    if _node_proc and _node_proc.poll() is None:
        try:
            os.killpg(os.getpgid(_node_proc.pid), signal.SIGTERM)
        except Exception:
            pass


app = FastAPI(title="P2P Gateway (FastAPI Reverse Proxy)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], allow_credentials=False,
)


@app.on_event("startup")
async def _startup():
    _ensure_postgres_and_redis()
    _spawn_node_backend()
    ready = _wait_for_node()
    if not ready:
        print("[proxy] WARNING: Node backend did not report ready within timeout")


_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "content-length", "host",
}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request):
    url = f"{NODE_URL}/api/{path}"
    if request.url.query:
        url += f"?{request.url.query}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.request(
            request.method, url, headers=headers, content=body,
        )
    resp_headers = {k: v for k, v in r.headers.items() if k.lower() not in _HOP_BY_HOP}
    return Response(content=r.content, status_code=r.status_code, headers=resp_headers,
                    media_type=r.headers.get("content-type"))


@app.get("/")
async def root():
    return {
        "service": "p2p-gateway",
        "stack": "React + FastAPI proxy → Node.js Express + PostgreSQL + Redis + TronWeb",
        "node_backend": NODE_URL,
    }
