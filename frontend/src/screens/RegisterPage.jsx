import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { api } from "@/lib/api";
import { persistSession } from "@/lib/session";
import { toast, Toaster } from "sonner";

export default function RegisterPage() {
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "FIAT",
    email: "",
    password: "",
    webhook_url: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.register(form);
      persistSession({ token: r.token, merchant: r.merchant });
      toast.success(`Registered ${r.merchant.name}`);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.error?.formErrors?.[0] || err?.response?.data?.error || "Register failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Toaster theme="dark" position="top-right" />
      <div className="panel" style={{ padding: 40, width: 520 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 600 }}>
          Merchant Onboarding
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: "12px 0 22px", letterSpacing: "-0.01em" }}>
          Register a new merchant
        </h1>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Code</label>
              <input data-testid="reg-code" className="input mono" required value={form.code} onChange={(e) => upd("code", e.target.value.toUpperCase())} placeholder="ACME_FIAT" />
            </div>
            <div>
              <label className="field-label">Type</label>
              <select data-testid="reg-type" className="select" value={form.type} onChange={(e) => upd("type", e.target.value)}>
                <option value="FIAT">Fiat Merchant</option>
                <option value="CRYPTO">Crypto Merchant</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Business Name</label>
            <input data-testid="reg-name" className="input" required value={form.name} onChange={(e) => upd("name", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input data-testid="reg-email" className="input" type="email" required value={form.email} onChange={(e) => upd("email", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password (min 6)</label>
            <input data-testid="reg-password" className="input" type="password" required minLength={6} value={form.password} onChange={(e) => upd("password", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Webhook URL (optional)</label>
            <input data-testid="reg-webhook" className="input mono" value={form.webhook_url} onChange={(e) => upd("webhook_url", e.target.value)} placeholder="https://…" />
          </div>
          <button data-testid="register-submit-btn" className="btn primary" disabled={loading}>
            {loading ? "Registering…" : "Create merchant →"}
          </button>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Already have an account? <Link href="/login" style={{ color: "#fff", textDecoration: "underline" }}>Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
