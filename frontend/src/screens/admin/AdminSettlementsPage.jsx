import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT, timeAgo } from "@/lib/session";
import MerchantFilter from "@/components/MerchantFilter";

export default function AdminSettlementsScreen() {
  const [rows, setRows] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  useEffect(() => {
    const p = merchantId ? { merchant_id: merchantId } : {};
    adminApi.settlements(p).then((r) => setRows(r.settlements)).catch(() => {});
  }, [merchantId]);

  return (
    <>
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Settlements</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Periodic financial recaps across all merchants.</div>
        </div>
        <MerchantFilter value={merchantId} onChange={setMerchantId} />
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>{rows.length} settlement{rows.length !== 1 && "s"}</span></div>
          <table className="tbl" data-testid="admin-settlements-table">
            <thead>
              <tr>
                <th>Merchant</th><th>Period</th>
                <th className="num" style={{ textAlign: "right" }}>Matches</th>
                <th className="num" style={{ textAlign: "right" }}>Gross USDT</th>
                <th className="num" style={{ textAlign: "right" }}>Fee</th>
                <th className="num" style={{ textAlign: "right" }}>Net USDT</th>
                <th>Status</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No settlements.</td></tr>}
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.merchant_name}<div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{s.merchant_code}</div></td>
                  <td style={{ fontSize: 11 }}>{new Date(s.period_start).toLocaleDateString("id-ID")} – {new Date(s.period_end).toLocaleDateString("id-ID")}</td>
                  <td className="num">{s.total_matches}</td>
                  <td className="num">{fmtUSDT(s.gross_volume_crypto)}</td>
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
