"""
FastAPI Reverse Proxy — bootstraps and routes to two Express services:

  /api/crypto/*  → Backend Crypto (Express)  on 127.0.0.1:8003  (owns TronWeb + hot wallet)
  /api/*         → Backend System (Express)  on 127.0.0.1:8002  (matching engine + business)

PostgreSQL + Redis are auto-started on boot. The FastAPI supervisor config is
READONLY so we tunnel Node services behind uvicorn to satisfy the required
"Node.js + Express" tech stack.
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


SYSTEM_HOST = "127.0.0.1"
SYSTEM_PORT = int(os.environ.get("SYSTEM_PORT", "8002"))
SYSTEM_URL = f"http://{SYSTEM_HOST}:{SYSTEM_PORT}"
SYSTEM_DIR = Path("/app/backend-system")

CRYPTO_HOST = "127.0.0.1"
CRYPTO_PORT = int(os.environ.get("CRYPTO_PORT", "8003"))
CRYPTO_URL = f"http://{CRYPTO_HOST}:{CRYPTO_PORT}"
CRYPTO_DIR = Path("/app/backend-crypto")


def _ensure_postgres_and_redis():
    try:
        subprocess.run(["pg_isready", "-h", "127.0.0.1", "-p", "5432"], check=True, capture_output=True, timeout=5)
    except Exception:
        subprocess.run(["pg_ctlcluster", "15", "main", "start"], capture_output=True)
    try:
        subprocess.run(["redis-cli", "ping"], check=True, capture_output=True, timeout=3)
    except Exception:
        subprocess.run(["redis-server", "--daemonize", "yes", "--port", "6379"], capture_output=True)


_processes: dict[str, subprocess.Popen] = {}


def _spawn(name: str, cwd: Path):
    p = _processes.get(name)
    if p and p.poll() is None:
        return
    node_bin = shutil.which("node") or "/usr/bin/node"
    proc = subprocess.Popen(
        [node_bin, "src/server.js"],
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ},
        preexec_fn=os.setsid,
    )
    _processes[name] = proc

    import threading

    def _pump():
        for line in proc.stdout:
            print(f"[{name}] {line.decode(errors='ignore').rstrip()}", flush=True)

    threading.Thread(target=_pump, daemon=True).start()


def _wait_for(url: str, timeout: float = 30.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = httpx.get(f"{url}/api/health", timeout=1.5)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.4)
    return False


@atexit.register
def _cleanup():
    for p in _processes.values():
        if p.poll() is None:
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
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
    # backend-crypto boots first so it can provision the hot wallet before matching starts.
    _spawn("crypto", CRYPTO_DIR)
    _wait_for(CRYPTO_URL, timeout=30)
    _spawn("system", SYSTEM_DIR)
    if not _wait_for(SYSTEM_URL, timeout=30):
        print("[proxy] WARNING: backend-system did not report ready in time")


_HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "content-length", "host",
}


async def _forward(target: str, request: Request, path: str) -> Response:
    url = f"{target}/api/{path}"
    if request.url.query:
        url += f"?{request.url.query}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.request(request.method, url, headers=headers, content=body)
    resp_headers = {k: v for k, v in r.headers.items() if k.lower() not in _HOP_BY_HOP}
    return Response(content=r.content, status_code=r.status_code, headers=resp_headers,
                    media_type=r.headers.get("content-type"))


@app.api_route("/api/crypto/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_crypto(path: str, request: Request):
    return await _forward(CRYPTO_URL, request, f"crypto/{path}")


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_system(path: str, request: Request):
    if path.startswith("crypto/") or path == "crypto":
        return await _forward(CRYPTO_URL, request, path)
    return await _forward(SYSTEM_URL, request, path)


@app.get("/")
async def root():
    return {
        "service": "p2p-gateway",
        "architecture": {
            "backend_system": f"{SYSTEM_URL} (Express — matching engine)",
            "backend_crypto": f"{CRYPTO_URL} (Express — TronWeb + hot wallet)",
            "database": "PostgreSQL @ 127.0.0.1:5432/p2p_gateway (shared)",
            "cache": "Redis @ 127.0.0.1:6379",
            "frontend": "Next.js @ :3000",
        },
    }
