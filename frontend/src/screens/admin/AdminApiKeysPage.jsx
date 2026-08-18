import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";
import MerchantFilter from "@/components/MerchantFilter";
import { Plus, Trash2, Copy, Power, PowerOff, X } from "lucide-react";

export default function AdminApiKeysScreen() {
  const [rows, setRows] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  const [reveal, setReveal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ merchant_id: "", label: "", ips: "" });

  const load = () => adminApi.apikeys(merchantId).then((r) => setRows(r.apikeys)).catch(() => {});
  useEffect(() => { load(); }, [merchantId]);

  async function create(e) {
    e.preventDefault();
    if (!form.merchant_id) return toast.error("Select a merchant");
    try {
      const r = await adminApi.createApiKey(form.merchant_id, form.label, form.ips.split(",").map((s) => s.trim()).filter(Boolean));
      setReveal(r.credentials);
      setForm({ merchant_id: "", label: "", ips: "" });
      setShowForm(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.error || "Create failed"); }
  }

  async function toggle(k) {
    try { await adminApi.patchApiKey(k.id, { active: !k.active }); load(); }
    catch (err) { toast.error("Toggle failed"); }
  }

  async function del(id) {
    if (!confirm("Delete API key?")) return;
    try { await adminApi.deleteApiKey(id); toast.success("Deleted"); load(); }
    catch (err) { toast.error("Delete failed"); }
  }

  function copy(v) { navigator.clipboard.writeText(v); toast.success("Copied"); }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>API Keys · CRUD</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Create, toggle, or delete API credentials for any merchant.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <MerchantFilter value={merchantId} onChange={setMerchantId} />
          <button data-testid="new-key-btn" className="btn primary" onClick={() => setShowForm(true)}><Plus size={13} /> New key</button>
        </div>
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>{rows.length} key{rows.length !== 1 && "s"}</span></div>
          <table className="tbl" data-testid="admin-keys-table">
            <thead>
              <tr><th>Merchant</th><th>Label</th><th>Key</th><th>IP Whitelist</th><th>Active</th><th>Last used</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>{k.merchant_name}<div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{k.merchant_code}</div></td>
                  <td>{k.label}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {k.api_key.slice(0, 12)}…{k.api_key.slice(-6)}
                    <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => copy(k.api_key)}><Copy size={10} /></button>
                  </td>
                  <td>{k.ip_whitelist?.length ? <span className="mono" style={{ fontSize: 11 }}>{k.ip_whitelist.join(", ")}</span> : <span className="chip warn">none</span>}</td>
                  <td>
                    <button data-testid={`toggle-${k.id}`} className="btn sm" onClick={() => toggle(k)}>
                      {k.active ? <><Power size={11} /> ON</> : <><PowerOff size={11} /> OFF</>}
                    </button>
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
                  <td><button data-testid={`del-${k.id}`} className="btn sm danger" onClick={() => del(k.id)}><Trash2 size={11} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", zIndex: 60 }} onClick={() => setShowForm(false)}>
          <div className="panel" style={{ width: 480, padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Create API key</h2>
              <button className="btn sm" onClick={() => setShowForm(false)}><X size={12} /></button>
            </div>
            <form onSubmit={create} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="field-label">Merchant</label>
                <MerchantFilter value={form.merchant_id} onChange={(v) => setForm((f) => ({ ...f, merchant_id: v }))} testid="form-merchant" />
              </div>
              <div>
                <label className="field-label">Label</label>
                <input data-testid="form-label" className="input" required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">IP Whitelist (comma-separated)</label>
                <input data-testid="form-ips" className="input mono" value={form.ips} onChange={(e) => setForm((f) => ({ ...f, ips: e.target.value }))} />
              </div>
              <button data-testid="form-submit" className="btn primary" type="submit">Generate credentials</button>
            </form>
          </div>
        </div>
      )}

      {reveal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", zIndex: 70 }} onClick={() => setReveal(null)}>
          <div className="panel" style={{ width: 560, padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--escrow)", fontWeight: 600 }}>Save credentials now</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 16px" }}>API credentials generated</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {["api_key","api_secret"].map((k) => (
                <div key={k}>
                  <div className="stat-label">{k.replace("_", " ").toUpperCase()}</div>
                  <div className="mono" style={{ fontSize: 12, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, wordBreak: "break-all" }}>{reveal[k]}</div>
                  <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(reveal[k])}><Copy size={11} /> Copy</button>
                </div>
              ))}
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
