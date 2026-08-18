import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT, fmtIDR } from "@/lib/session";
import { TrendingUp, Layers, Wallet, ArrowRightLeft } from "lucide-react";
import { toast, Toaster } from "sonner";

export default function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [book, setBook] = useState({ topup: [], redeem: [] });

  useEffect(() => {
    const load = () => {
      api.stats().then(setStats).catch(() => {});
      api.book().then(setBook).catch(() => {});
    };
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, []);

  const cards = stats ? [
    { label: "Active Orders", value: stats.orders?.active_orders || 0, sub: `${stats.orders?.orders_24h || 0} in last 24h`, Icon: Layers },
    { label: "Completed Matches", value: stats.matches?.total_matches || 0, sub: `${fmtUSDT(stats.matches?.volume_crypto_24h)} USDT / 24h`, Icon: ArrowRightLeft },
    { label: "Escrow Volume (USDT)", value: fmtUSDT(stats.matches?.volume_crypto), sub: `Deposits: ${stats.transactions?.deposits || 0} · Releases: ${stats.transactions?.releases || 0}`, Icon: TrendingUp },
    { label: "Hot Wallet Balance", value: fmtUSDT(stats.hot_wallet?.balance_cache), sub: `Network: ${stats.platform?.network?.toUpperCase()} · Fee ${stats.platform?.fee_bps} bps`, Icon: Wallet },
  ] : [];

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar title="Overview" subtitle="Live matching engine performance & escrow state." />

      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.label} className="stat-card" data-testid={`stat-${c.label.replace(/\s+/g, "-").toLowerCase()}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="stat-label">{c.label}</div>
                <c.Icon size={16} style={{ color: "var(--text-dim)" }} />
              </div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="panel">
            <div className="panel-h">
              <span>Order Book · TopUp (Fiat → Crypto)</span>
              <span className="chip buy">BUY USDT</span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th className="num" style={{ textAlign: "right" }}>Price IDR/USDT</th>
                  <th className="num" style={{ textAlign: "right" }}>Remain USDT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody data-testid="topup-book">
                {book.topup.length === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>No open TopUp orders.</td></tr>
                )}
                {book.topup.map((o) => (
                  <tr key={o.id}>
                    <td>{o.merchant_name}</td>
                    <td className="num" style={{ color: "var(--topup)" }}>{Number(o.price_idr_per_usdt).toLocaleString("id-ID")}</td>
                    <td className="num">{fmtUSDT(o.remaining_crypto_amount)}</td>
                    <td><span className="chip ok">{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-h">
              <span>Order Book · Redeem (Crypto → Fiat)</span>
              <span className="chip sell">SELL USDT</span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th className="num" style={{ textAlign: "right" }}>Price IDR/USDT</th>
                  <th className="num" style={{ textAlign: "right" }}>Remain USDT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody data-testid="redeem-book">
                {book.redeem.length === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--text-muted)", padding: 24, textAlign: "center" }}>No open Redeem orders.</td></tr>
                )}
                {book.redeem.map((o) => (
                  <tr key={o.id}>
                    <td>{o.merchant_name}</td>
                    <td className="num" style={{ color: "var(--redeem)" }}>{Number(o.price_idr_per_usdt).toLocaleString("id-ID")}</td>
                    <td className="num">{fmtUSDT(o.remaining_crypto_amount)}</td>
                    <td><span className="chip ok">{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
