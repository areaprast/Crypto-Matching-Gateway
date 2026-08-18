import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { persistSession } from "@/lib/session";
import { toast, Toaster } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("fiat@demo.com");
  const [password, setPassword] = useState("fiat123456");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.login(email, password);
      persistSession({ token: r.token, merchant: r.merchant });
      toast.success(`Welcome, ${r.merchant.name}`);
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const fillFiat = () => { setEmail("fiat@demo.com"); setPassword("fiat123456"); };
  const fillCrypto = () => { setEmail("crypto@demo.com"); setPassword("crypto123456"); };

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", position: "relative" }}>
      <Toaster theme="dark" position="top-right" />
      <div
        style={{
          position: "absolute",
          top: 24, left: 32,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "var(--text-muted)",
        }}
      >
        P2P Matching Gateway <span style={{ color: "var(--topup)", marginLeft: 8 }}>● Node.js · TRON Nile</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 0, width: "min(1120px, 92vw)" }}>
        <div className="panel" style={{ padding: 40 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 600 }}>
            Merchant Console
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 600, margin: "12px 0 6px", letterSpacing: "-0.02em" }}>
            Sign in to the gateway
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>
            Access the bi-directional order book, matching engine, and settlement ledger.
          </p>

          <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
            <div>
              <label className="field-label">Email</label>
              <input
                data-testid="login-email"
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                data-testid="login-password"
                className="input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button data-testid="login-submit-btn" className="btn primary" disabled={loading} style={{ marginTop: 6 }}>
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <div className="divider" style={{ margin: "26px 0 18px" }} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 10 }}>
            Demo Merchants
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button type="button" data-testid="fill-fiat-btn" className="btn" onClick={fillFiat}>Fiat Merchant</button>
            <button type="button" data-testid="fill-crypto-btn" className="btn" onClick={fillCrypto}>Crypto Merchant</button>
          </div>

          <div style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)" }}>
            Don't have an account? <Link to="/register" data-testid="link-register" style={{ color: "#fff", textDecoration: "underline" }}>Register a merchant</Link>
          </div>
        </div>

        <div
          style={{
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 600 }}>
              System
            </div>
            <h2 style={{ fontSize: 20, marginTop: 12, lineHeight: 1.35, fontWeight: 500 }}>
              A B2B matching gateway that pairs <span style={{ color: "var(--topup)" }}>fiat top-ups</span> and{" "}
              <span style={{ color: "var(--redeem)" }}>crypto redemptions</span> — with escrowed settlement.
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 40 }}>
            {[
              ["Bi-Directional", "TopUp ↔ Redeem order book with price/time priority."],
              ["Multi-Match", "1-to-many & many-to-1 pecahan splits via match_items."],
              ["Escrow", "USDT locked in system hot wallet, released after fiat P2P transfer."],
              ["API + HMAC", "Merchant API key + secret + IP whitelist per spec."],
            ].map(([t, d]) => (
              <div key={t} style={{ borderLeft: "2px solid #2f2f34", paddingLeft: 12 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
                  {t}
                </div>
                <div style={{ fontSize: 12, color: "var(--text)", marginTop: 6, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
