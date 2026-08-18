import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Radio } from "lucide-react";

export default function Topbar({ title, subtitle, right }) {
  const [balance, setBalance] = useState(null);
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    api.hotWallet().then((r) => {
      setWallet(r.wallet);
      setBalance(r.wallet?.balance_cache);
    });
  }, []);

  return (
    <header
      className="panel"
      style={{
        borderLeft: 0,
        borderRight: 0,
        borderTop: 0,
        padding: "18px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {right}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
          data-testid="tron-status"
        >
          <span style={{ color: "var(--topup)" }} className="pulse">
            <Radio size={14} />
          </span>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
              TRON Nile
            </div>
            <div className="mono" style={{ fontSize: 11 }}>
              {wallet ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : "—"}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "8px 14px",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
          data-testid="escrow-balance"
        >
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Escrow Balance
          </div>
          <div className="mono" style={{ fontSize: 14, marginTop: 2 }}>
            {Number(balance || 0).toFixed(2)} <span style={{ color: "var(--text-muted)", fontSize: 11 }}>USDT</span>
          </div>
        </div>
      </div>
    </header>
  );
}
