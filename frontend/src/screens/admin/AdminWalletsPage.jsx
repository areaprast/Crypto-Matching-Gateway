import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT, timeAgo, shortHash } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Trash2, Save } from "lucide-react";

export default function AdminWalletsScreen() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState({});
  const load = () => adminApi.wallets().then((r) => setRows(r.wallets)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function saveBalance(id) {
    const v = edit[id];
    if (v === undefined) return;
    try {
      await adminApi.setWalletBalance(id, Number(v));
      toast.success("Balance updated");
      setEdit((e) => ({ ...e, [id]: undefined }));
      load();
    } catch (err) { toast.error(err?.response?.data?.error || "Update failed"); }
  }

  async function del(id, purpose) {
    if (purpose === "HOT_ESCROW") { toast.error("Hot escrow wallet is protected"); return; }
    if (!confirm("Delete wallet?")) return;
    try { await adminApi.deleteWallet(id); toast.success("Deleted"); load(); }
    catch (err) { toast.error(err?.response?.data?.error || "Delete failed"); }
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Hot Wallets</h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Manage on-chain custody wallets. Hot escrow wallet is auto-provisioned & protected.</div>
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>{rows.length} wallet{rows.length !== 1 && "s"}</span></div>
          <table className="tbl" data-testid="admin-wallets-table">
            <thead>
              <tr>
                <th>Purpose</th><th>Merchant</th><th>Network</th><th>Address</th>
                <th className="num" style={{ textAlign: "right" }}>Balance (USDT)</th>
                <th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td><span className={w.purpose === "HOT_ESCROW" ? "chip warn" : "chip ok"}>{w.purpose}</span></td>
                  <td style={{ fontSize: 12 }}>{w.merchant_name || "—"}<div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{w.merchant_code || "system"}</div></td>
                  <td className="mono" style={{ fontSize: 11 }}>{w.network}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{shortHash(w.address, 10)}</td>
                  <td className="num">
                    <input
                      data-testid={`bal-${w.id}`}
                      className="input mono"
                      style={{ padding: "4px 8px", fontSize: 12, width: 120, textAlign: "right" }}
                      value={edit[w.id] !== undefined ? edit[w.id] : fmtUSDT(w.balance_cache)}
                      onChange={(e) => setEdit((s) => ({ ...s, [w.id]: e.target.value }))}
                    />
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(w.created_at)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button data-testid={`save-${w.id}`} className="btn sm" onClick={() => saveBalance(w.id)} disabled={edit[w.id] === undefined}><Save size={11} /></button>
                    <button data-testid={`del-${w.id}`} className="btn sm danger" onClick={() => del(w.id, w.purpose)} disabled={w.purpose === "HOT_ESCROW"}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
