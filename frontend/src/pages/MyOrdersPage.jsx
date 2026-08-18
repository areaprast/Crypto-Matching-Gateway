import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT, timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const load = () => api.orders().then((r) => setOrders(r.orders)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    try {
      await api.cancelOrder(id);
      toast.success("Order cancelled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Cancel failed");
    }
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar title="My Orders" subtitle="Order history & status for this merchant." />
      <div style={{ padding: 24 }}>
        <div className="panel">
          <div className="panel-h"><span>All Orders</span><span className="chip ok">{orders.length}</span></div>
          <table className="tbl" data-testid="my-orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Side</th>
                <th className="num" style={{ textAlign: "right" }}>Price</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th className="num" style={{ textAlign: "right" }}>Remaining</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No orders yet.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.id.slice(0, 8)}</td>
                  <td>
                    <span className={o.side === "TOPUP" ? "chip buy" : "chip sell"}>{o.side}</span>
                  </td>
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
                  <td>
                    {["OPEN", "PARTIALLY_MATCHED"].includes(o.status) && (
                      <button data-testid={`cancel-${o.id}`} className="btn sm danger" onClick={() => cancel(o.id)}>Cancel</button>
                    )}
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
