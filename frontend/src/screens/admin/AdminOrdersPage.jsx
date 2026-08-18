import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT, timeAgo } from "@/lib/session";
import MerchantFilter from "@/components/MerchantFilter";

export default function AdminOrdersScreen() {
  const [rows, setRows] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  const [side, setSide] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = {};
    if (merchantId) params.merchant_id = merchantId;
    if (side) params.side = side;
    if (status) params.status = status;
    adminApi.orders(params).then((r) => setRows(r.orders)).catch(() => {});
  }, [merchantId, side, status]);

  return (
    <>
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Orders</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Every order across every merchant.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select data-testid="filter-side" className="select" style={{ padding: "8px 12px" }} value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">All sides</option><option value="TOPUP">TOPUP</option><option value="REDEEM">REDEEM</option>
          </select>
          <select data-testid="filter-status" className="select" style={{ padding: "8px 12px" }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {["OPEN","PARTIALLY_MATCHED","MATCHING","COMPLETED","CANCELLED","EXPIRED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <MerchantFilter value={merchantId} onChange={setMerchantId} testid="filter-merchant" />
        </div>
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>{rows.length} order{rows.length !== 1 && "s"}</span></div>
          <table className="tbl" data-testid="admin-orders-table">
            <thead>
              <tr>
                <th>Merchant</th><th>Side</th>
                <th className="num" style={{ textAlign: "right" }}>Price</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th className="num" style={{ textAlign: "right" }}>Remaining</th>
                <th>Status</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No orders match this filter.</td></tr>
              )}
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontSize: 12 }}>{o.merchant_name}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{o.merchant_code}</div>
                  </td>
                  <td><span className={o.side === "TOPUP" ? "chip buy" : "chip sell"}>{o.side}</span></td>
                  <td className="num">{Number(o.price_idr_per_usdt).toLocaleString("id-ID")}</td>
                  <td className="num">{fmtUSDT(o.crypto_amount)}</td>
                  <td className="num">{fmtUSDT(o.remaining_crypto_amount)}</td>
                  <td>
                    <span className={
                      o.status === "COMPLETED" ? "chip buy" :
                      o.status === "CANCELLED" ? "chip sell" :
                      o.status === "PARTIALLY_MATCHED" ? "chip warn" : "chip ok"
                    }>{o.status}</span>
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
