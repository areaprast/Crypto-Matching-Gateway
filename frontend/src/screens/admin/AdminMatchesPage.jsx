import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT, timeAgo, shortHash } from "@/lib/session";
import MerchantFilter from "@/components/MerchantFilter";

export default function AdminMatchesScreen() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [merchantId, setMerchantId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const p = {};
    if (merchantId) p.merchant_id = merchantId;
    if (status) p.status = status;
    adminApi.matches(p).then((r) => setRows(r.matches)).catch(() => {});
  }, [merchantId, status]);

  return (
    <>
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Matches</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Every match across every merchant.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select data-testid="filter-status" className="select" style={{ padding: "8px 12px" }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {["AWAITING_ESCROW","AWAITING_FIAT","RELEASED","FAILED","CANCELLED"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <MerchantFilter value={merchantId} onChange={setMerchantId} />
        </div>
      </header>
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16 }}>
        <div className="panel" style={{ maxHeight: "calc(100vh - 180px)", overflow: "auto" }}>
          <div className="panel-h"><span>{rows.length} match{rows.length !== 1 && "es"}</span></div>
          <table className="tbl" data-testid="admin-matches-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Parties</th>
                <th className="num" style={{ textAlign: "right" }}>USDT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => adminApi.match(m.id).then(setSelected)}>
                  <td className="mono" style={{ fontSize: 11 }}>{m.reference}</td>
                  <td style={{ fontSize: 11 }}>
                    <span style={{ color: "var(--topup)" }}>{m.topup_merchant_code}</span>{" "}
                    ↔ <span style={{ color: "var(--redeem)" }}>{m.redeem_merchant_code}</span>
                  </td>
                  <td className="num">{fmtUSDT(m.total_crypto_amount)}</td>
                  <td>
                    <span className={
                      m.status === "RELEASED" ? "chip buy" :
                      m.status === "FAILED" || m.status === "CANCELLED" ? "chip sell" : "chip warn"
                    }>{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="panel-h"><span>Match Detail</span>{selected && <span className="mono" style={{ fontSize: 11 }}>{selected.match.reference}</span>}</div>
          {!selected ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a match to view items + on-chain transactions.</div>
          ) : (
            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Cell label="USDT" value={fmtUSDT(selected.match.total_crypto_amount)} />
                <Cell label="IDR" value={Number(selected.match.total_fiat_amount).toLocaleString("id-ID")} />
                <Cell label="Fee USDT" value={fmtUSDT(selected.match.platform_fee_crypto)} />
              </div>
              <div>
                <div className="stat-label" style={{ marginBottom: 8 }}>Items</div>
                {selected.items.map((it) => (
                  <div key={it.id} style={{ padding: 12, border: "1px solid var(--border)", background: "var(--surface-2)", marginBottom: 8, fontSize: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10 }}>
                      <div>
                        <div className="stat-label">Fiat side</div>
                        <div>{it.topup_merchant_name}</div>
                        <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>→ {shortHash(it.destination_wallet, 8)}</div>
                      </div>
                      <div>
                        <div className="stat-label">Crypto side</div>
                        <div>{it.redeem_merchant_name}</div>
                        <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{it.destination_bank_name} · {it.destination_bank_account}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono">{fmtUSDT(it.crypto_amount)}</div>
                        <span className={it.status === "RELEASED" ? "chip buy" : "chip warn"}>{it.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {selected.transactions.length > 0 && (
                <table className="tbl">
                  <thead><tr><th>Direction</th><th>TxID</th><th className="num" style={{ textAlign: "right" }}>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {selected.transactions.map((t) => (
                      <tr key={t.id}>
                        <td><span className={t.direction === "DEPOSIT" ? "chip warn" : "chip buy"}>{t.direction}</span></td>
                        <td className="mono" style={{ fontSize: 11 }}>{shortHash(t.txid, 10)}</td>
                        <td className="num">{fmtUSDT(t.amount)}</td>
                        <td><span className="chip ok">{t.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function Cell({ label, value }) {
  return (
    <div style={{ padding: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="stat-label">{label}</div>
      <div className="mono" style={{ fontSize: 14, marginTop: 4 }}>{value}</div>
    </div>
  );
}
