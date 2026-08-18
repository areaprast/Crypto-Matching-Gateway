import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminApi";
import { fmtUSDT } from "@/lib/session";
import { Users, Receipt, ArrowRightLeft, Wallet, TrendingUp, ShieldAlert } from "lucide-react";

export default function AdminOverviewScreen() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const load = () => adminApi.stats().then(setStats).catch(() => {});
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, []);

  const cards = stats ? [
    { label: "Merchants", value: stats.merchants?.total || 0, sub: `Fiat ${stats.merchants?.fiat} · Crypto ${stats.merchants?.crypto}`, Icon: Users },
    { label: "Orders (24h)", value: stats.orders?.last_24h || 0, sub: `${stats.orders?.active} active · ${stats.orders?.total} total`, Icon: Receipt },
    { label: "Matches Released", value: stats.matches?.released || 0, sub: `${fmtUSDT(stats.matches?.volume_crypto)} USDT total volume`, Icon: ArrowRightLeft },
    { label: "Platform Fees", value: fmtUSDT(stats.matches?.platform_fee), sub: `${stats.transactions?.releases} releases · ${stats.transactions?.deposits} deposits`, Icon: TrendingUp },
    { label: "Hot Wallets", value: stats.wallets?.hot_wallets || 0, sub: `${fmtUSDT(stats.wallets?.total_balance)} USDT cached`, Icon: Wallet },
    { label: "Admins", value: stats.admins_count || 0, sub: "Platform operators", Icon: ShieldAlert },
  ] : [];

  return (
    <>
      <header className="panel" style={{ borderLeft: 0, borderRight: 0, borderTop: 0, padding: "18px 28px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>Platform Overview</h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>System-wide KPIs across every merchant.</div>
      </header>

      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.label} className="stat-card" data-testid={`adm-stat-${c.label.replace(/\s+/g,"-").toLowerCase()}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="stat-label">{c.label}</div>
                <c.Icon size={16} style={{ color: "var(--text-dim)" }} />
              </div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-h"><span>Quick actions</span></div>
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              ["Manage Merchants", "/admin/merchants"],
              ["Inspect Matches",  "/admin/matches"],
              ["Hot Wallets",      "/admin/wallets"],
              ["Webhook Config",   "/admin/webhooks"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="btn" style={{ textDecoration: "none" }}>
                {label} →
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
