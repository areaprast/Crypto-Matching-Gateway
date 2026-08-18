import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT, timeAgo, shortHash } from "@/lib/session";
import MerchantFilter from "@/components/MerchantFilter";

export default function AdminTransactionsScreen() {
  const [rows, setRows] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  const [direction, setDirection] = useState("");

  useEffect(() => {
    const p = {};
    if (merchantId) p.merchant_id = merchantId;
    if (direction) p.direction = direction;
    adminApi.transactions(p).then((r) => setRows(r.transactions)).catch(() => {});
  }, [merchantId, direction]);

  return (
    <>
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Transaction Ledger</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Every on-chain deposit & release.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select data-testid="filter-direction" className="select" style={{ padding: "8px 12px" }} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">Any direction</option>
            <option value="DEPOSIT">DEPOSIT</option>
            <option value="RELEASE">RELEASE</option>
            <option value="REFUND">REFUND</option>
          </select>
          <MerchantFilter value={merchantId} onChange={setMerchantId} />
        </div>
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>{rows.length} transaction{rows.length !== 1 && "s"}</span></div>
          <table className="tbl" data-testid="admin-txs-table">
            <thead>
              <tr>
                <th>Direction</th><th>Parties</th>
                <th>From</th><th>To</th><th>TxID</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th><th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No transactions.</td></tr>}
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><span className={t.direction === "DEPOSIT" ? "chip warn" : "chip buy"}>{t.direction}</span></td>
                  <td style={{ fontSize: 11 }}>
                    <span style={{ color: "var(--topup)" }}>{t.topup_merchant_name || "—"}</span>{" ↔ "}
                    <span style={{ color: "var(--redeem)" }}>{t.redeem_merchant_name || "—"}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{shortHash(t.from_address, 6)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{shortHash(t.to_address, 6)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{shortHash(t.txid, 10)}</td>
                  <td className="num">{fmtUSDT(t.amount)}</td>
                  <td><span className={t.status === "CONFIRMED" ? "chip buy" : t.status === "FAILED" ? "chip sell" : "chip warn"}>{t.status}</span></td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
