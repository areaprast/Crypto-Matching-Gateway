import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT, shortHash, timeAgo } from "@/lib/session";

export default function TransactionsPage() {
  const [txs, setTxs] = useState([]);
  useEffect(() => { api.transactions().then((r) => setTxs(r.transactions)).catch(() => {}); }, []);

  return (
    <>
      <Topbar title="Transaction Ledger" subtitle="On-chain deposits (escrow) and releases per match_item." />
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>All Transactions</span><span className="chip ok">{txs.length}</span></div>
          <table className="tbl" data-testid="transactions-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>TxID</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No on-chain ledger entries yet.</td></tr>
              )}
              {txs.map((t) => (
                <tr key={t.id}>
                  <td><span className={t.direction === "DEPOSIT" ? "chip warn" : "chip buy"}>{t.direction}</span></td>
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
