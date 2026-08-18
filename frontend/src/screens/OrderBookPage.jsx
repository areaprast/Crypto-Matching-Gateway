import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { currentMerchant, fmtUSDT } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { Plus, X } from "lucide-react";

export default function OrderBookPage() {
  const [book, setBook] = useState({ topup: [], redeem: [] });
  const [showForm, setShowForm] = useState(false);
  const m = currentMerchant();

  const load = () => api.book().then(setBook).catch(() => {});
  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  const isFiat = m?.type === "FIAT";
  const defaultSide = isFiat ? "TOPUP" : "REDEEM";

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar
        title="Order Book"
        subtitle="Bi-directional TopUp ↔ Redeem — price/time priority multi-matching."
        right={
          <button
            data-testid="new-order-btn"
            className="btn primary"
            onClick={() => setShowForm(true)}
          >
            <Plus size={14} /> New {defaultSide} Order
          </button>
        }
      />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BookColumn
          title="TopUp — Fiat wants USDT"
          side="TOPUP"
          rows={book.topup}
          priceLabel="Bid Price"
          color="var(--topup)"
        />
        <BookColumn
          title="Redeem — Crypto sells USDT"
          side="REDEEM"
          rows={book.redeem}
          priceLabel="Ask Price"
          color="var(--redeem)"
        />
      </div>

      {showForm && (
        <NewOrderDialog
          side={defaultSide}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </>
  );
}

function BookColumn({ title, side, rows, priceLabel, color }) {
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{title}</span>
        <span className={side === "TOPUP" ? "chip buy" : "chip sell"}>{side}</span>
      </div>
      <table className="tbl" data-testid={`book-${side.toLowerCase()}`}>
        <thead>
          <tr>
            <th>Merchant</th>
            <th className="num" style={{ textAlign: "right" }}>{priceLabel}</th>
            <th className="num" style={{ textAlign: "right" }}>Remaining USDT</th>
            <th className="num" style={{ textAlign: "right" }}>Total IDR</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                No open {side} orders.
              </td>
            </tr>
          )}
          {rows.map((o) => (
            <tr key={o.id} className="flash-in">
              <td>
                <div style={{ fontSize: 12 }}>{o.merchant_name}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{o.merchant_code}</div>
              </td>
              <td className="num" style={{ color, fontWeight: 600 }}>
                {Number(o.price_idr_per_usdt).toLocaleString("id-ID")}
              </td>
              <td className="num">{fmtUSDT(o.remaining_crypto_amount)}</td>
              <td className="num" style={{ color: "var(--text-muted)" }}>
                {Number(o.remaining_fiat_amount).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
              </td>
              <td>
                <span className={o.status === "OPEN" ? "chip ok" : o.status === "PARTIALLY_MATCHED" ? "chip warn" : "chip ok"}>
                  {o.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewOrderDialog({ side, onClose, onCreated }) {
  const [form, setForm] = useState({
    side,
    price_idr_per_usdt: 16250,
    crypto_amount: 10,
    destination_wallet: "",
    destination_bank_name: "BCA",
    destination_bank_account: "",
    destination_bank_holder: "",
    expires_minutes: 60,
  });
  const [submitting, setSubmitting] = useState(false);

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api.createOrder(form);
      const matches = r.matches?.length || 0;
      toast.success(`Order created — ${matches > 0 ? `${matches} match${matches > 1 ? "es" : ""} generated ⚡` : "waiting for match"}`);
      onCreated();
    } catch (err) {
      toast.error(err?.response?.data?.error?.formErrors?.[0] || err?.response?.data?.error || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  const fiatTotal = (Number(form.price_idr_per_usdt) * Number(form.crypto_amount)) || 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, display: "grid", placeItems: "center" }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 560, padding: 32, background: "var(--surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>
              New Order
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: "6px 0 0" }}>
              {side === "TOPUP" ? "TopUp USDT (buy)" : "Redeem USDT (sell)"}
            </h2>
          </div>
          <button data-testid="close-dialog" className="btn sm" onClick={onClose}><X size={12} /></button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Price IDR / USDT</label>
              <input data-testid="form-price" className="input mono" type="number" step="1" required
                value={form.price_idr_per_usdt} onChange={(e) => upd("price_idr_per_usdt", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Amount USDT</label>
              <input data-testid="form-amount" className="input mono" type="number" step="0.000001" required
                value={form.crypto_amount} onChange={(e) => upd("crypto_amount", e.target.value)} />
            </div>
          </div>

          <div className="panel" style={{ padding: 14, background: "var(--surface-2)" }}>
            <div className="stat-label">Total notional</div>
            <div className="mono" style={{ fontSize: 18, marginTop: 4 }}>
              {fiatTotal.toLocaleString("id-ID", { maximumFractionDigits: 0 })} <span style={{ fontSize: 12, color: "var(--text-muted)" }}>IDR</span>
            </div>
          </div>

          {side === "TOPUP" ? (
            <div>
              <label className="field-label">Destination USDT Wallet (User Fiat)</label>
              <input data-testid="form-wallet" className="input mono" required
                placeholder="T…"
                value={form.destination_wallet} onChange={(e) => upd("destination_wallet", e.target.value)} />
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <div>
                  <label className="field-label">Bank</label>
                  <input data-testid="form-bank-name" className="input" required
                    value={form.destination_bank_name} onChange={(e) => upd("destination_bank_name", e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Account No.</label>
                  <input data-testid="form-bank-acc" className="input mono" required
                    value={form.destination_bank_account} onChange={(e) => upd("destination_bank_account", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="field-label">Account Holder</label>
                <input data-testid="form-bank-holder" className="input" required
                  value={form.destination_bank_holder} onChange={(e) => upd("destination_bank_holder", e.target.value)} />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" data-testid="submit-order-btn" className="btn primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Place order →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
