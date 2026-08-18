import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { toast, Toaster } from "sonner";
import { Plus, KeyRound, Copy, Trash2, Shield } from "lucide-react";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [form, setForm] = useState({ label: "", ips: "" });

  const load = () => api.apikeys().then((r) => setKeys(r.apikeys)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const ips = form.ips.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await api.createApiKey(form.label, ips);
      setReveal(r.credentials);
      setForm({ label: "", ips: "" });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Create failed");
    } finally { setCreating(false); }
  }

  async function del(id) {
    if (!confirm("Delete this API key?")) return;
    await api.deleteApiKey(id);
    toast.success("API key deleted");
    load();
  }

  function copy(v) { navigator.clipboard.writeText(v); toast.success("Copied"); }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar title="API Keys" subtitle="Merchant API credentials for M2M endpoints — API key + secret + IP whitelist." />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        <div className="panel">
          <div className="panel-h"><span>Active Keys</span><span className="chip ok">{keys.length}</span></div>
          <table className="tbl" data-testid="apikeys-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>IP Whitelist</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No API keys yet — create your first on the right.</td></tr>
              )}
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <KeyRound size={13} style={{ color: "var(--text-dim)" }} /> {k.label}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {k.api_key.slice(0, 12)}…{k.api_key.slice(-6)}
                    <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => copy(k.api_key)}><Copy size={11} /></button>
                  </td>
                  <td>
                    {k.ip_whitelist?.length > 0 ? (
                      <div className="mono" style={{ fontSize: 11 }}>{k.ip_whitelist.join(", ")}</div>
                    ) : <span className="chip warn">No whitelist</span>}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                  </td>
                  <td>
                    <button data-testid={`delete-key-${k.id}`} className="btn sm danger" onClick={() => del(k.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-h"><span>Create Key</span></div>
          <form onSubmit={create} style={{ padding: 20, display: "grid", gap: 14 }}>
            <div>
              <label className="field-label">Label</label>
              <input data-testid="key-label" className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">IP Whitelist (comma-separated, optional)</label>
              <input data-testid="key-ips" className="input mono" placeholder="203.0.113.10, 198.51.100.24" value={form.ips} onChange={(e) => setForm((f) => ({ ...f, ips: e.target.value }))} />
            </div>
            <button data-testid="create-key-btn" className="btn primary" disabled={creating}>
              <Plus size={13} /> {creating ? "Creating…" : "Generate credentials"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
              <Shield size={11} style={{ display: "inline", marginRight: 4 }} />
              Secrets are stored as bcrypt hashes. The plaintext secret is shown exactly once — copy it immediately.
            </div>
          </form>
        </div>
      </div>

      {reveal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", zIndex: 60 }}
          onClick={() => setReveal(null)}
        >
          <div className="panel" style={{ width: 560, padding: 32, background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--escrow)", fontWeight: 600 }}>
              Save these credentials now
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 20px" }}>API credentials generated</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div className="stat-label">API Key</div>
                <div className="mono" style={{ fontSize: 12, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, wordBreak: "break-all" }}>
                  {reveal.api_key}
                </div>
                <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(reveal.api_key)}><Copy size={11} /> Copy key</button>
              </div>
              <div>
                <div className="stat-label">API Secret</div>
                <div className="mono" style={{ fontSize: 12, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, wordBreak: "break-all" }}>
                  {reveal.api_secret}
                </div>
                <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(reveal.api_secret)}><Copy size={11} /> Copy secret</button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, background: "rgba(245,158,11,0.08)", padding: 12, border: "1px solid rgba(245,158,11,0.25)" }}>
                {reveal.note}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button data-testid="reveal-close" className="btn primary" onClick={() => setReveal(null)}>I've saved them</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
