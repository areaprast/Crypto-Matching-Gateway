import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT, timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Sparkles } from "lucide-react";

export default function SettlementsPage() {
  const [rows, setRows] = useState([]);
  const [gen, setGen] = useState(false);
  const load = () => api.settlements().then((r) => setRows(r.settlements)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function generate() {
    setGen(true);
    try {
      const r = await api.generateSettlement();
      toast.success(`Settlement draft created (${r.settlement.total_matches} matches)`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Generate failed");
    } finally { setGen(false); }
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar
        title="Settlements"
        subtitle="Periodic financial recap — gross volume, platform fees, net."
        right={
          <button data-testid="generate-settlement-btn" className="btn primary" onClick={generate} disabled={gen}>
            <Sparkles size={14} /> {gen ? "Generating…" : "Generate 7-day Recap"}
          </button>
        }
      />
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>All Settlements</span><span className="chip ok">{rows.length}</span></div>
          <table className="tbl" data-testid="settlements-table">
            <thead>
              <tr>
                <th>Period</th>
                <th className="num" style={{ textAlign: "right" }}>Matches</th>
                <th className="num" style={{ textAlign: "right" }}>Gross USDT</th>
                <th className="num" style={{ textAlign: "right" }}>Gross IDR</th>
                <th className="num" style={{ textAlign: "right" }}>Fee USDT</th>
                <th className="num" style={{ textAlign: "right" }}>Net USDT</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No settlement recap yet — click generate.</td></tr>
              )}
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontSize: 11 }}>
                    {new Date(s.period_start).toLocaleDateString("id-ID")} — {new Date(s.period_end).toLocaleDateString("id-ID")}
                  </td>
                  <td className="num">{s.total_matches}</td>
                  <td className="num">{fmtUSDT(s.gross_volume_crypto)}</td>
                  <td className="num">{Number(s.gross_volume_fiat).toLocaleString("id-ID")}</td>
                  <td className="num" style={{ color: "var(--escrow)" }}>{fmtUSDT(s.platform_fee_crypto)}</td>
                  <td className="num" style={{ color: "var(--topup)" }}>{fmtUSDT(s.net_volume_crypto)}</td>
                  <td><span className="chip warn">{s.status}</span></td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
