import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Save, RefreshCw, Send, Copy } from "lucide-react";

export default function AdminWebhooksScreen() {
  const [merchants, setMerchants] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [secret, setSecret] = useState(null);
  const [deliveries, setDeliveries] = useState([]);

  async function load() {
    const r = await adminApi.webhookMerchants();
    setMerchants(r.merchants);
    if (!selectedId && r.merchants[0]) setSelectedId(r.merchants[0].id);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) return;
    const m = merchants.find((x) => x.id === selectedId);
    setUrlDraft(m?.webhook_url || "");
    setSecret(null);
    adminApi.webhookDeliveries(selectedId).then((r) => setDeliveries(r.deliveries)).catch(() => {});
    const i = setInterval(() => adminApi.webhookDeliveries(selectedId).then((r) => setDeliveries(r.deliveries)).catch(() => {}), 8000);
    return () => clearInterval(i);
  }, [selectedId, merchants]);

  async function saveUrl() {
    try { await adminApi.setWebhookUrl(selectedId, urlDraft); toast.success("URL saved"); load(); }
    catch (err) { toast.error(err?.response?.data?.error || "Save failed"); }
  }

  async function rotate() {
    if (!confirm("Rotate signing secret for this merchant?")) return;
    try { const r = await adminApi.rotateWebhookSecret(selectedId); setSecret(r.webhook_secret); toast.success("Rotated"); }
    catch (err) { toast.error("Rotate failed"); }
  }

  async function redeliver(id) {
    try { await adminApi.redeliverWebhook(id); toast.success("Redelivery queued"); }
    catch { toast.error("Failed"); }
  }

  function copy(v) { navigator.clipboard.writeText(v); toast.success("Copied"); }

  const selected = merchants.find((m) => m.id === selectedId);

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Webhooks · CRUD</h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Configure per-merchant webhook URL, rotate secret, inspect deliveries.</div>
      </header>

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-h"><span>Merchants</span><span className="chip ok">{merchants.length}</span></div>
          <div style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto" }}>
            {merchants.map((m) => (
              <button
                key={m.id}
                data-testid={`wh-select-${m.code}`}
                onClick={() => setSelectedId(m.id)}
                className="sidebar-link"
                style={{
                  width: "100%", border: 0, borderLeft: "2px solid transparent",
                  background: selectedId === m.id ? "rgba(255,255,255,0.05)" : "transparent",
                  color: selectedId === m.id ? "var(--text)" : "var(--text-muted)",
                  borderLeftColor: selectedId === m.id ? "var(--accent)" : "transparent",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div>{m.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{m.code} · {m.type}</div>
                </div>
                <span className={m.webhook_url ? "chip buy" : "chip warn"} style={{ padding: "1px 6px", fontSize: 9 }}>
                  {m.webhook_url ? "SET" : "NONE"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="panel">
              <div className="panel-h"><span>Endpoint · {selected.code}</span></div>
              <div style={{ padding: 20, display: "grid", gap: 12 }}>
                <div>
                  <label className="field-label">Webhook URL</label>
                  <input data-testid="wh-url" className="input mono" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://..." />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button data-testid="wh-save" className="btn primary" onClick={saveUrl}><Save size={13} /> Save URL</button>
                  <button data-testid="wh-rotate" className="btn danger" onClick={rotate}><RefreshCw size={13} /> Rotate secret</button>
                </div>
                {secret && (
                  <div style={{ marginTop: 6 }}>
                    <div className="stat-label">New signing secret (shown once)</div>
                    <div className="mono" style={{ fontSize: 12, padding: 10, background: "var(--surface-2)", border: "1px solid rgba(245,158,11,0.35)", marginTop: 6, wordBreak: "break-all", color: "var(--escrow)" }}>{secret}</div>
                    <button className="btn sm" style={{ marginTop: 6 }} onClick={() => copy(secret)}><Copy size={11} /> Copy</button>
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h"><span>Deliveries</span><span className="chip ok">{deliveries.length}</span></div>
              <table className="tbl" data-testid="wh-deliveries">
                <thead><tr><th>Event</th><th>Status</th><th>HTTP</th><th>Attempt</th><th>When</th><th></th></tr></thead>
                <tbody>
                  {deliveries.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No deliveries yet for this merchant.</td></tr>}
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td><span className={d.event_type === "match.released" ? "chip buy" : "chip warn"}>{d.event_type}</span></td>
                      <td><span className={d.status === "SUCCESS" ? "chip buy" : d.status === "FAILED" ? "chip sell" : "chip warn"}>{d.status}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{d.response_status ?? "—"}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{d.attempt}/{d.max_attempts}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(d.created_at)}</td>
                      <td><button data-testid={`redeliver-${d.id}`} className="btn sm" onClick={() => redeliver(d.id)}><Send size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
