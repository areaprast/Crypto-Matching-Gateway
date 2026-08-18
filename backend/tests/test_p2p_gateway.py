"""
Backend regression tests for the B2B P2P Matching Gateway.
Covers: health, auth, orders/matching, escrow/release flow, apikeys, settlements,
hot wallet, stats, transactions, cancel, and role enforcement.
"""
import os
import time
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

FIAT_CREDS = {"email": "fiat@demo.com", "password": "fiat123456"}
CRYPTO_CREDS = {"email": "crypto@demo.com", "password": "crypto123456"}

# Valid TRON base58 address (34 chars starting with T)
DEST_WALLET = "TXYZopMKmDwmMZmvGnUoUZmoUmvUoZmvUo"


# ---------- session-scoped fixtures ----------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    data = r.json()
    assert "token" in data and "merchant" in data
    return data["token"], data["merchant"]


@pytest.fixture(scope="session")
def fiat_auth(s):
    tok, m = _login(s, FIAT_CREDS)
    return {"token": tok, "merchant": m, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="session")
def crypto_auth(s):
    tok, m = _login(s, CRYPTO_CREDS)
    return {"token": tok, "merchant": m, "headers": {"Authorization": f"Bearer {tok}"}}


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is True


# ---------- Auth ----------
def test_login_success(s):
    r = s.post(f"{API}/auth/login", json=FIAT_CREDS)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j.get("token"), str) and len(j["token"]) > 20
    assert j["merchant"]["email"] == FIAT_CREDS["email"]


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": FIAT_CREDS["email"], "password": "wrong"})
    assert r.status_code == 401


def test_register_new_and_duplicate(s):
    suffix = uuid.uuid4().hex[:8].upper()
    email = f"test_{suffix.lower()}@example.com"
    payload = {
        "code": f"TEST_{suffix}",
        "email": email,
        "password": "TestPass123",
        "name": "TEST Merchant",
        "type": "FIAT",
    }
    r = s.post(f"{API}/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    j = r.json()
    assert "token" in j
    # duplicate
    r2 = s.post(f"{API}/auth/register", json=payload)
    assert r2.status_code == 409


# ---------- Order book ----------
def test_order_book_requires_auth(s):
    r = s.get(f"{API}/orders/book")
    assert r.status_code == 401


def test_order_book_bidirectional(s, fiat_auth):
    r = s.get(f"{API}/orders/book", headers=fiat_auth["headers"])
    assert r.status_code == 200, r.text
    j = r.json()
    assert "topup" in j and "redeem" in j
    assert isinstance(j["topup"], list) and isinstance(j["redeem"], list)


# ---------- Role enforcement on order creation ----------
def test_fiat_cannot_create_redeem(s, fiat_auth):
    r = s.post(
        f"{API}/orders",
        headers=fiat_auth["headers"],
        json={
            "side": "REDEEM",
            "price_idr_per_usdt": 16200,
            "crypto_amount": 10,
            "destination_bank_name": "BCA",
            "destination_bank_account": "1234567890",
            "destination_bank_holder": "TEST",
        },
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_crypto_cannot_create_topup(s, crypto_auth):
    r = s.post(
        f"{API}/orders",
        headers=crypto_auth["headers"],
        json={
            "side": "TOPUP",
            "price_idr_per_usdt": 16300,
            "crypto_amount": 10,
            "destination_wallet": DEST_WALLET,
        },
    )
    assert r.status_code == 403


# ---------- Ensure REDEEM liquidity ----------
@pytest.fixture(scope="session")
def ensure_redeem_liquidity(s, crypto_auth):
    """Create fresh REDEEM orders so matching tests are deterministic."""
    created = []
    for price, qty in [(16200, 30), (16250, 25)]:
        r = s.post(
            f"{API}/orders",
            headers=crypto_auth["headers"],
            json={
                "side": "REDEEM",
                "price_idr_per_usdt": price,
                "crypto_amount": qty,
                "destination_bank_name": "BCA",
                "destination_bank_account": "1234567890",
                "destination_bank_holder": "TEST Crypto",
            },
        )
        assert r.status_code in (200, 201), f"Failed to seed REDEEM {price}: {r.status_code} {r.text}"
        created.append(r.json())
    return created


# ---------- Order create + matching ----------
@pytest.fixture(scope="session")
def matched_topup(s, fiat_auth, ensure_redeem_liquidity):
    r = s.post(
        f"{API}/orders",
        headers=fiat_auth["headers"],
        json={
            "side": "TOPUP",
            "price_idr_per_usdt": 16300,
            "crypto_amount": 40,
            "destination_wallet": DEST_WALLET,
        },
    )
    assert r.status_code in (200, 201), f"create topup: {r.status_code} {r.text}"
    return r.json()


def test_topup_creates_matches(matched_topup):
    order = matched_topup.get("order", matched_topup)
    matches = matched_topup.get("matches") or order.get("matches") or []
    assert isinstance(matches, list)
    assert len(matches) >= 1, f"expected at least 1 match, got: {matched_topup}"
    # Total matched crypto should be up to 40
    total = 0.0
    for m in matches:
        total += float(m.get("total_crypto_amount") or m.get("total_crypto") or m.get("crypto_amount") or 0)
    assert total > 0, f"matched total is zero. matches={matches}"


# ---------- Match detail ----------
def test_match_detail_unauth(s, matched_topup):
    matches = matched_topup.get("matches") or matched_topup.get("order", {}).get("matches") or []
    if not matches:
        pytest.skip("no match to inspect")
    mid = matches[0]["id"]
    r = s.get(f"{API}/matches/{mid}")
    assert r.status_code == 401


def test_match_detail_authed(s, fiat_auth, matched_topup):
    matches = matched_topup.get("matches") or matched_topup.get("order", {}).get("matches") or []
    if not matches:
        pytest.skip("no match")
    mid = matches[0]["id"]
    r = s.get(f"{API}/matches/{mid}", headers=fiat_auth["headers"])
    assert r.status_code == 200, r.text
    j = r.json()
    assert "items" in j and isinstance(j["items"], list) and len(j["items"]) >= 1
    it = j["items"][0]
    # match header enriched with merchant names
    assert ("topup_merchant_name" in j) or ("topup_merchant_name" in it)


# ---------- Escrow / Confirm-fiat flow ----------
@pytest.fixture(scope="session")
def escrow_result(s, crypto_auth, matched_topup):
    matches = matched_topup.get("matches") or matched_topup.get("order", {}).get("matches") or []
    if not matches:
        pytest.skip("no matches produced")
    mid = matches[0]["id"]
    # fetch items with crypto auth
    r = s.get(f"{API}/matches/{mid}", headers=crypto_auth["headers"])
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    item_id = items[0]["id"]
    esc = s.post(
        f"{API}/matches/{mid}/escrow",
        headers=crypto_auth["headers"],
        json={"item_id": item_id},
    )
    assert esc.status_code in (200, 201), f"escrow failed: {esc.status_code} {esc.text}"
    return {"match_id": mid, "item_id": item_id, "response": esc.json()}


def test_escrow_creates_deposit_txn(s, crypto_auth, escrow_result):
    # Verify transaction created
    r = s.get(f"{API}/transactions", headers=crypto_auth["headers"])
    assert r.status_code == 200
    txns = r.json()
    if isinstance(txns, dict):
        txns = txns.get("transactions") or txns.get("data") or []
    types = [t.get("direction") or t.get("type") or t.get("tx_type") for t in txns]
    assert any(t == "DEPOSIT" for t in types), f"no DEPOSIT txn found. types={types}"


def test_fiat_cannot_escrow(s, fiat_auth, matched_topup):
    matches = matched_topup.get("matches") or matched_topup.get("order", {}).get("matches") or []
    if not matches:
        pytest.skip("no matches")
    mid = matches[0]["id"]
    r = s.get(f"{API}/matches/{mid}", headers=fiat_auth["headers"])
    items = r.json().get("items", [])
    if not items:
        pytest.skip("no items")
    r2 = s.post(
        f"{API}/matches/{mid}/escrow",
        headers=fiat_auth["headers"],
        json={"item_id": items[0]["id"]},
    )
    assert r2.status_code == 403


def test_confirm_fiat_and_release(s, fiat_auth, crypto_auth, escrow_result):
    mid = escrow_result["match_id"]
    item_id = escrow_result["item_id"]
    # Per implementation, only the crypto (redeem) merchant confirms IDR receipt.
    r = s.post(
        f"{API}/matches/{mid}/confirm-fiat",
        headers=crypto_auth["headers"],
        json={"item_id": item_id},
    )
    assert r.status_code in (200, 201), f"confirm-fiat: {r.status_code} {r.text}"
    j = r.json()
    assert "txid" in j, f"no txid: {j}"
    assert "released_amount" in j
    # Verify RELEASE transaction exists
    time.sleep(0.5)
    r2 = s.get(f"{API}/transactions", headers=crypto_auth["headers"])
    assert r2.status_code == 200
    txns = r2.json()
    if isinstance(txns, dict):
        txns = txns.get("transactions") or txns.get("data") or []
    types = [t.get("direction") or t.get("type") or t.get("tx_type") for t in txns]
    assert any(t == "RELEASE" for t in types), f"no RELEASE txn. types={types}"
    # match status
    r3 = s.get(f"{API}/matches/{mid}", headers=fiat_auth["headers"])
    assert r3.status_code == 200
    md = r3.json()
    # item should be RELEASED
    it = next((i for i in md["items"] if i["id"] == item_id), None)
    assert it is not None
    assert it.get("status") == "RELEASED", f"item status={it.get('status')}"


# ---------- API Keys ----------
def test_apikey_lifecycle(s, fiat_auth):
    h = fiat_auth["headers"]
    r = s.post(f"{API}/apikeys", headers=h, json={"label": "TEST_KEY"})
    assert r.status_code in (200, 201), r.text
    j = r.json()
    creds = j.get("credentials") or j
    assert "api_key" in creds and "api_secret" in creds
    key_row = j.get("apikey") or {}
    key_id = key_row.get("id") or j.get("id")
    if not key_id:
        # try to find via list
        rl = s.get(f"{API}/apikeys", headers=h)
        assert rl.status_code == 200
        keys = rl.json()
        if isinstance(keys, dict):
            keys = keys.get("keys") or keys.get("data") or []
        # find by api_key prefix
        pk = j["api_key"]
        for k in keys:
            if k.get("api_key") == pk or (isinstance(k.get("api_key"), str) and pk.startswith(k["api_key"][:6])):
                key_id = k.get("id")
                break
    # List without secret
    rl = s.get(f"{API}/apikeys", headers=h)
    assert rl.status_code == 200
    keys = rl.json()
    if isinstance(keys, dict):
        keys = keys.get("apikeys") or keys.get("keys") or keys.get("data") or []
    for k in keys:
        assert "secret_hash" not in k
        assert "api_secret" not in k
    # PATCH toggle
    if key_id:
        rp = s.patch(f"{API}/apikeys/{key_id}", headers=h, json={"active": False})
        assert rp.status_code in (200, 204), rp.text
        # DELETE
        rd = s.delete(f"{API}/apikeys/{key_id}", headers=h)
        assert rd.status_code in (200, 204), rd.text


# ---------- Settlements ----------
def test_generate_settlement(s, fiat_auth):
    r = s.post(f"{API}/settlements/generate", headers=fiat_auth["headers"], json={})
    assert r.status_code in (200, 201), r.text
    j = r.json()
    settle = j.get("settlement") or j
    assert "total_matches" in settle or "matches_count" in settle or "total_trades" in settle
    tm = int(settle.get("total_matches") or settle.get("matches_count") or settle.get("total_trades") or 0)
    assert tm >= 1
    # net = gross - platform_fee
    gross = float(settle.get("gross_volume_crypto") or settle.get("gross_crypto") or 0)
    fee = float(settle.get("platform_fee_crypto") or settle.get("fee_crypto") or 0)
    net = float(settle.get("net_volume_crypto") or settle.get("net_crypto") or 0)
    if gross and net:
        assert abs((gross - fee) - net) < 0.01


# ---------- Hot wallet ----------
def test_hot_wallet(s, fiat_auth):
    r = s.get(f"{API}/crypto/hot-wallet", headers=fiat_auth["headers"])
    assert r.status_code == 200, r.text
    j = r.json()
    addr = j.get("address") or j.get("wallet", {}).get("address")
    assert isinstance(addr, str) and addr.startswith("T") and len(addr) >= 30
    assert ("balance_cache" in j) or ("balance_cache" in j.get("wallet", {}))


# ---------- Stats ----------
def test_stats(s, fiat_auth):
    r = s.get(f"{API}/stats", headers=fiat_auth["headers"])
    assert r.status_code == 200, r.text
    j = r.json()
    for key in ["orders", "matches", "transactions", "hot_wallet", "platform"]:
        assert key in j, f"missing key {key} in stats: {list(j.keys())}"


# ---------- Order cancel ----------
def test_order_cancel(s, crypto_auth):
    # create a fresh redeem then cancel it
    r = s.post(
        f"{API}/orders",
        headers=crypto_auth["headers"],
        json={
            "side": "REDEEM",
            "price_idr_per_usdt": 17000,
            "crypto_amount": 5,
            "destination_bank_name": "BCA",
            "destination_bank_account": "1234567890",
            "destination_bank_holder": "TEST",
        },
    )
    assert r.status_code in (200, 201), r.text
    order = r.json().get("order", r.json())
    oid = order["id"]
    rc = s.post(f"{API}/orders/{oid}/cancel", headers=crypto_auth["headers"])
    assert rc.status_code in (200, 204), f"cancel: {rc.status_code} {rc.text}"
    # verify status
    rl = s.get(f"{API}/orders/book", headers=crypto_auth["headers"])
    assert rl.status_code == 200
