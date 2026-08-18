import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { timeAgo, shortHash } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Save, RefreshCw, Copy, Send, Eye, EyeOff, Webhook } from "lucide-react";

const EVENT_COLORS = {
  "match.created": "chip warn",
  "match.escrowed": "chip warn",
  "match.released": "chip buy",
};

export default function WebhooksPage() {
  const [cfg, setCfg] = useState({ webhook_url: "", webhook_secret: "" });
  const [urlDraft, setUrlDraft] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function loadAll() {
    const [c, d] = await Promise.all([api.webhookConfig(), api.webhookDeliveries()]);
    setCfg(c);
    setUrlDraft(c.webhook_url || "");
    setDeliveries(d.deliveries);
  }

  useEffect(() => {
    loadAll();
    const i = setInterval(() => api.webhookDeliveries().then((d) => setDeliveries(d.deliveries)), 6000);
    return () => clearInterval(i);
  }, []);

  async function saveUrl() {
    setSaving(true);
    try {
      await api.saveWebhookUrl(urlDraft);
      toast.success("Webhook URL saved");
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Save failed");
    } finally { setSaving(false); }
  }

  async function rotate() {
    if (!confirm("Rotate signing secret? Any existing consumers will start receiving signatures from the new secret immediately.")) return;
    setRotating(true);
    try {
      const r = await api.rotateWebhookSecret();
      setCfg((c) => ({ ...c, webhook_secret: r.webhook_secret }));
      setShowSecret(true);
      toast.success("Signing secret rotated");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Rotate failed");
    } finally { setRotating(false); }
  }

  async function redeliver(id) {
    try {
      await api.redeliverWebhook(id);
      toast.success("Redelivery queued");
      setTimeout(loadAll, 1200);
    } catch (e) {
      toast.error("Redeliver failed");
    }
  }

  function copy(v) { navigator.clipboard.writeText(v); toast.success("Copied to clipboard"); }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar
        title="Webhooks"
        subtitle="Fan-out match.created · match.escrowed · match.released to your endpoint with HMAC-SHA256 signatures."
      />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
        {/* Config panel */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="panel">
            <div className="panel-h">
              <span>Endpoint</span>
              <Webhook size={13} style={{ color: "var(--text-muted)" }} />
            </div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div>
                <label className="field-label">Webhook URL</label>
                <input
                  data-testid="webhook-url-input"
                  className="input mono"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://your-api.example.com/p2p/webhook"
                />
              </div>
              <button data-testid="save-webhook-btn" className="btn primary" onClick={saveUrl} disabled={saving}>
                <Save size={13} /> {saving ? "Saving…" : "Save URL"}
              </button>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                We POST JSON with headers <span className="mono">X-P2P-Signature</span>,{" "}
                <span className="mono">X-P2P-Event</span>, <span className="mono">X-P2P-Event-Id</span>,{" "}
                <span className="mono">X-P2P-Attempt</span>. Timeouts + non-2xx responses are retried at
                5s, 30s, 5m, 30m, 2h (up to 5 attempts).
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><span>Signing Secret</span></div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div className="mono" style={{ fontSize: 12, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", wordBreak: "break-all" }}>
                {cfg.webhook_secret
                  ? showSecret
                    ? cfg.webhook_secret
                    : `${cfg.webhook_secret.slice(0, 12)}${"•".repeat(20)}${cfg.webhook_secret.slice(-6)}`
                  : "—"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button data-testid="toggle-secret-btn" className="btn sm" onClick={() => setShowSecret((s) => !s)}>
                  {showSecret ? <EyeOff size={12} /> : <Eye size={12} />} {showSecret ? "Hide" : "Reveal"}
                </button>
                <button className="btn sm" onClick={() => copy(cfg.webhook_secret || "")}>
                  <Copy size={12} /> Copy
                </button>
                <button data-testid="rotate-secret-btn" className="btn sm danger" onClick={rotate} disabled={rotating}>
                  <RefreshCw size={12} /> {rotating ? "…" : "Rotate"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                Verify each request:{" "}
                <span className="mono" style={{ background: "var(--surface-2)", padding: "1px 4px" }}>
                  hmac_sha256(secret, `${"${t}"}.${"${bodyJson}"}`) === v1
                </span>
                . Parse <span className="mono">X-P2P-Signature</span> as{" "}
                <span className="mono">t=&lt;ts&gt;,v1=&lt;hex&gt;</span>.
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><span>Events</span></div>
            <div style={{ padding: 16, display: "grid", gap: 8 }}>
              {[
                ["match.created", "Fires when the matching engine creates a new match_item for you."],
                ["match.escrowed", "Fires when USDT is escrowed to the hot wallet for an item."],
                ["match.released", "Fires after IDR confirmed & USDT released on-chain."],
              ].map(([k, d]) => (
                <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12 }}>
                  <span className={EVENT_COLORS[k]}>{k}</span>
                  <span style={{ color: "var(--text-muted)", flex: 1, lineHeight: 1.5 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deliveries panel */}
        <div className="panel" style={{ minHeight: 400 }}>
          <div className="panel-h">
            <span>Recent Deliveries</span>
            <span className="chip ok" data-testid="delivery-count">{deliveries.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <div style={{ borderRight: "1px solid var(--border)", maxHeight: "calc(100vh - 200px)", overflow: "auto" }}>
              <table className="tbl" data-testid="deliveries-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>When</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No deliveries yet. Trigger a match to see activity.</td></tr>
                  )}
                  {deliveries.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelected(d)}
                      style={{ cursor: "pointer", background: selected?.id === d.id ? "rgba(255,255,255,0.03)" : undefined }}
                      data-testid={`delivery-row-${d.id}`}
                    >
                      <td><span className={EVENT_COLORS[d.event_type] || "chip"}>{d.event_type}</span></td>
                      <td>
                        <span className={d.status === "SUCCESS" ? "chip buy" : d.status === "FAILED" ? "chip sell" : "chip warn"}>
                          {d.status}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 6 }}>
                          {d.attempt}/{d.max_attempts}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{d.response_status ?? "—"}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(d.created_at)}</td>
                      <td>
                        <button
                          data-testid={`redeliver-${d.id}`}
                          className="btn sm"
                          onClick={(e) => { e.stopPropagation(); redeliver(d.id); }}
                          title="Redeliver"
                        >
                          <Send size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 20, maxHeight: "calc(100vh - 200px)", overflow: "auto" }}>
              {!selected ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", paddingTop: 60 }}>
                  Select a delivery to inspect the payload, signature, and response.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <Row label="Event Type" value={<span className={EVENT_COLORS[selected.event_type] || "chip"}>{selected.event_type}</span>} />
                  <Row label="Event ID" value={<span className="mono" style={{ fontSize: 11 }}>{selected.event_id}</span>} />
                  <Row label="Target" value={<span className="mono" style={{ fontSize: 11 }}>{selected.target_url}</span>} />
                  <Row label="Attempts" value={`${selected.attempt} / ${selected.max_attempts}`} />
                  <Row label="Response HTTP" value={selected.response_status ?? "—"} />
                  <Row label="Next Retry" value={selected.next_retry_at ? new Date(selected.next_retry_at).toLocaleString() : "—"} />
                  <div>
                    <div className="stat-label">X-P2P-Signature</div>
                    <div className="mono" style={{ fontSize: 11, padding: 8, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, wordBreak: "break-all" }}>
                      {selected.signature}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Payload</div>
                    <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, overflow: "auto", maxHeight: 280 }}>
{JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  </div>
                  {selected.response_body && (
                    <div>
                      <div className="stat-label">Response Body</div>
                      <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", marginTop: 6, overflow: "auto", maxHeight: 140 }}>
{selected.response_body}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>{value}</div>
    </div>
  );
}
