import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { PowerOff, Power } from "lucide-react";

export default function AdminMerchantsScreen() {
  const [rows, setRows] = useState([]);
  const load = () => adminApi.merchants().then((r) => setRows(r.merchants)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function toggle(m) {
    const next = m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!confirm(`Set ${m.code} → ${next}?`)) return;
    try { await adminApi.setMerchantStatus(m.id, next); toast.success(`${m.code} → ${next}`); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Failed"); }
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Merchants</h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>All merchants — activate or suspend.</div>
      </header>
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>All Merchants</span><span className="chip ok">{rows.length}</span></div>
          <table className="tbl" data-testid="admin-merchants-table">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Type</th><th>Email</th>
                <th className="num" style={{ textAlign: "right" }}>Orders</th>
                <th>Status</th><th>Created</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="mono" style={{ fontSize: 11 }}>{m.code}</td>
                  <td>{m.name}</td>
                  <td><span className={m.type === "FIAT" ? "chip buy" : "chip sell"}>{m.type}</span></td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.email}</td>
                  <td className="num">{m.orders_count}</td>
                  <td><span className={m.status === "ACTIVE" ? "chip buy" : "chip sell"}>{m.status}</span></td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(m.created_at)}</td>
                  <td>
                    <button data-testid={`toggle-${m.code}`} className="btn sm" onClick={() => toggle(m)}>
                      {m.status === "ACTIVE" ? <PowerOff size={11} /> : <Power size={11} />}
                      {m.status === "ACTIVE" ? " Suspend" : " Activate"}
                    </button>
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
