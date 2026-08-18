import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Download, FileSignature, ShieldCheck } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ExportsPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setPreview(await api.exportPreview(year, month));
    } catch (e) {
      toast.error(e?.response?.data?.error || "Preview failed");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  async function download() {
    const token = localStorage.getItem("p2p_token");
    try {
      const r = await fetch(api.exportDownloadUrl(year, month), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const digest = r.headers.get("x-export-digest");
      const sig = r.headers.get("x-export-signature");
      const rows = r.headers.get("x-export-row-count");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `p2p-ledger-${year}-${String(month).padStart(2, "0")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${rows} rows · digest ${digest?.slice(0, 12)}…`);
      console.log("[export] digest=", digest, " signature=", sig);
    } catch (e) {
      toast.error("Download failed");
    }
  }

  const yearOptions = [now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2];

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar
        title="Signed Ledger Export"
        subtitle="Auditable monthly CSV of matches, escrows, and releases — signed with your webhook HMAC secret."
      />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-h"><span>Period</span><FileSignature size={13} style={{ color: "var(--text-muted)" }} /></div>
          <div style={{ padding: 24, display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="field-label">Year</label>
                <select data-testid="export-year" className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Month</label>
                <select data-testid="export-month" className="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{String(i + 1).padStart(2, "0")} · {m}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
              <MetaCell label="Rows" value={loading ? "…" : (preview?.row_count ?? 0)} />
              <MetaCell label="Volume USDT" value={loading ? "…" : fmtUSDT(preview?.crypto_total)} />
              <MetaCell label="Volume IDR" value={loading ? "…" : Number(preview?.fiat_total || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })} />
            </div>

            <button
              data-testid="download-csv-btn"
              className="btn primary"
              disabled={loading || !preview?.row_count}
              onClick={download}
              style={{ marginTop: 6 }}
            >
              <Download size={14} /> Download signed CSV
            </button>

            {!preview?.row_count && !loading && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                No ledger activity in this period. Try a month with completed matches.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><span>Verifying the signature</span><ShieldCheck size={13} style={{ color: "var(--text-muted)" }} /></div>
          <div style={{ padding: 24, display: "grid", gap: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            <div>
              Every CSV is signed with the <span className="mono" style={{ color: "var(--text)" }}>webhook_secret</span> from your
              Webhooks page. The same value that verifies webhook deliveries also verifies these exports —
              one secret, two purposes.
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Headers on the download response</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li className="mono" style={{ fontSize: 11 }}>X-Export-Digest: sha256(csv_body)</li>
                <li className="mono" style={{ fontSize: 11 }}>X-Export-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</li>
                <li className="mono" style={{ fontSize: 11 }}>X-Export-Row-Count: &lt;n&gt;</li>
              </ul>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Also in-file (last two lines)</div>
              <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
{`# digest_sha256=<hex>
# signature=t=<unix>,v1=<hex>`}
              </pre>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Verify in Python</div>
              <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "auto" }}>
{`import hashlib, hmac
body = open("ledger.csv","rb").read()
# strip signature footer before hashing:
body_no_footer = body.split(b"# digest_sha256=")[0]
digest = hashlib.sha256(body_no_footer).hexdigest()
t, v1 = "1787...", "a63b..."   # from headers or file footer
mac = hmac.new(SECRET.encode(), f"{digest}.{t}".encode(),
               hashlib.sha256).hexdigest()
assert hmac.compare_digest(mac, v1)`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MetaCell({ label, value }) {
  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="stat-label">{label}</div>
      <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>{value}</div>
    </div>
  );
}
