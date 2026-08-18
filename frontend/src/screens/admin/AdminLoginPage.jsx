import { useState } from "react";
import { useRouter } from "next/router";
import { adminApi, persistAdmin } from "@/lib/adminApi";
import { toast, Toaster } from "sonner";
import { Shield } from "lucide-react";

export default function AdminLoginScreen() {
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("admin123456");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await adminApi.login(email, password);
      persistAdmin({ token: r.token, admin: r.admin });
      toast.success(`Welcome, ${r.admin.name}`);
      router.push("/admin");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", position: "relative" }}>
      <Toaster theme="dark" position="top-right" />
      <div style={{
        position: "absolute", top: 24, left: 32,
        fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em",
        color: "var(--text-muted)",
      }}>
        P2P Matching Gateway <span style={{ color: "var(--redeem)", marginLeft: 8 }}>● Admin Console</span>
      </div>

      <div className="panel" style={{ padding: 40, width: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, background: "var(--redeem)", color: "#000", display: "grid", placeItems: "center" }}>
            <Shield size={22} strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--text-muted)", fontWeight: 600 }}>
            Platform Operator
          </div>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 600, margin: "12px 0 6px", letterSpacing: "-0.02em" }}>
          Admin sign in
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 28 }}>
          Elevated access — audit merchants, manage wallets, keys, webhooks.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
          <div>
            <label className="field-label">Email</label>
            <input data-testid="admin-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input data-testid="admin-password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button data-testid="admin-login-btn" className="btn primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div className="divider" style={{ margin: "22px 0 10px" }} />
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Merchant users → <a href="/login" style={{ color: "var(--text)" }}>/login</a>
        </div>
      </div>
    </div>
  );
}
