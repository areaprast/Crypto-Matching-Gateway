import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Shield, LayoutDashboard, Users, Receipt, GitMerge, Landmark, Wallet, KeyRound, Webhook, LogOut, FileSignature } from "lucide-react";
import { currentAdmin, clearAdmin } from "@/lib/adminApi";

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", testid: "adm-nav-overview" },
  { to: "/admin/merchants", icon: Users, label: "Merchants", testid: "adm-nav-merchants" },
  { to: "/admin/orders", icon: Receipt, label: "Orders", testid: "adm-nav-orders" },
  { to: "/admin/matches", icon: GitMerge, label: "Matches", testid: "adm-nav-matches" },
  { to: "/admin/transactions", icon: Landmark, label: "Ledger", testid: "adm-nav-transactions" },
  { to: "/admin/settlements", icon: FileSignature, label: "Settlements", testid: "adm-nav-settlements" },
  { to: "/admin/wallets", icon: Wallet, label: "Hot Wallets", testid: "adm-nav-wallets" },
  { to: "/admin/apikeys", icon: KeyRound, label: "API Keys", testid: "adm-nav-apikeys" },
  { to: "/admin/webhooks", icon: Webhook, label: "Webhooks", testid: "adm-nav-webhooks" },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem("p2p_admin_token");
    if (!t) { router.replace("/admin/login"); return; }
    setMe(currentAdmin());
    setReady(true);
  }, [router]);

  if (!ready) return null;
  const activePath = router.asPath.split("?")[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <aside
        className="panel"
        style={{
          width: 240, minHeight: "100vh",
          borderTop: 0, borderBottom: 0, borderLeft: 0,
          display: "flex", flexDirection: "column",
        }}
        data-testid="admin-sidebar"
      >
        <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32, height: 32, background: "var(--redeem)", color: "#000",
                display: "grid", placeItems: "center", fontWeight: 700,
              }}
            ><Shield size={16} strokeWidth={2.5} /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>ADMIN CONSOLE</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Platform Operator
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 14px 8px" }}>
          <div className="stat-label">Signed in</div>
          <div style={{ fontSize: 13, marginTop: 6 }} data-testid="admin-name">{me?.name || "—"}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{me?.email}</div>
        </div>

        <nav style={{ padding: "10px 0", flex: 1 }}>
          {NAV.map(({ to, icon: Icon, label, testid }) => {
            const isActive = to === "/admin" ? activePath === to : activePath.startsWith(to);
            return (
              <Link
                key={to} href={to} data-testid={testid}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={16} strokeWidth={1.5} /> {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ borderTop: "1px solid var(--border)", padding: 14 }}>
          <button
            data-testid="admin-logout-btn"
            className="btn"
            style={{ width: "100%" }}
            onClick={() => { clearAdmin(); router.push("/admin/login"); }}
          ><LogOut size={14} /> Logout</button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
    </div>
  );
}
