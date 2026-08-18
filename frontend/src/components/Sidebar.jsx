import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, BookOpen, GitMerge, Wallet, Receipt, KeyRound, Landmark, LogOut } from "lucide-react";
import { currentMerchant, clearSession } from "@/lib/session";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview", testid: "nav-overview" },
  { to: "/dashboard/orderbook", icon: BookOpen, label: "Order Book", testid: "nav-orderbook" },
  { to: "/dashboard/orders", icon: Receipt, label: "My Orders", testid: "nav-orders" },
  { to: "/dashboard/matches", icon: GitMerge, label: "Matches", testid: "nav-matches" },
  { to: "/dashboard/transactions", icon: Landmark, label: "Ledger", testid: "nav-transactions" },
  { to: "/dashboard/wallet", icon: Wallet, label: "Hot Wallet", testid: "nav-wallet" },
  { to: "/dashboard/settlements", icon: Receipt, label: "Settlements", testid: "nav-settlements" },
  { to: "/dashboard/apikeys", icon: KeyRound, label: "API Keys", testid: "nav-apikeys" },
];

export default function Sidebar() {
  const m = currentMerchant();
  const nav = useNavigate();
  return (
    <aside
      data-testid="sidebar"
      className="panel"
      style={{
        width: 240,
        minHeight: "100vh",
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            className="mono"
            style={{
              width: 32,
              height: 32,
              background: "#fff",
              color: "#000",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            P2P
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>
              MATCH GATEWAY
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
              Bi-Directional · Escrow
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 14px 8px" }}>
        <div className="stat-label">Merchant</div>
        <div style={{ fontSize: 13, marginTop: 6 }} data-testid="sidebar-merchant-name">
          {m?.name || "—"}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
          {m?.code} · <span className={m?.type === "FIAT" ? "chip buy" : "chip sell"} style={{ padding: "1px 6px", fontSize: 9 }}>{m?.type}</span>
        </div>
      </div>

      <nav style={{ padding: "10px 0", flex: 1 }}>
        {NAV.map(({ to, icon: Icon, label, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            data-testid={testid}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <Icon size={16} strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
        <button
          data-testid="logout-btn"
          className="btn"
          style={{ width: "100%" }}
          onClick={() => {
            clearSession();
            nav("/login");
          }}
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </aside>
  );
}
