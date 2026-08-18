import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { fmtUSDT, shortHash } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { RefreshCw, Copy } from "lucide-react";

export default function WalletPage() {
  const [w, setW] = useState(null);
  const [live, setLive] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { api.hotWallet().then((r) => setW(r)); }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await api.refreshHotWallet();
      setLive(r);
      toast.success(r.usdt_balance !== null ? `Balance refreshed: ${r.usdt_balance} USDT` : "TronGrid unavailable — using cached balance");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to refresh");
    } finally { setRefreshing(false); }
  }

  function copy(v) { navigator.clipboard.writeText(v); toast.success("Copied to clipboard"); }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar title="Hot Wallet · TRON Nile"
        subtitle="System-owned escrow wallet holds USDT during a match's escrow window."
        right={<button data-testid="refresh-wallet-btn" className="btn" onClick={refresh} disabled={refreshing}><RefreshCw size={14} /> {refreshing ? "Refreshing…" : "Refresh Balance"}</button>}
      />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="panel">
          <div className="panel-h"><span>Escrow Wallet</span><span className="chip warn">HOT_ESCROW</span></div>
          <div style={{ padding: 20, display: "grid", gap: 16 }}>
            <div>
              <div className="stat-label">Address</div>
              <div className="mono" style={{ fontSize: 15, marginTop: 8, display: "flex", alignItems: "center", gap: 10 }} data-testid="wallet-address">
                {w?.wallet?.address || "—"}
                {w?.wallet?.address && (
                  <button className="btn sm" onClick={() => copy(w.wallet.address)}><Copy size={11} /></button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MetaCell label="Cached Balance" value={fmtUSDT(w?.wallet?.balance_cache) + " USDT"} />
              <MetaCell label="Live Balance" value={live?.usdt_balance !== undefined && live?.usdt_balance !== null ? fmtUSDT(live.usdt_balance) + " USDT" : "—"} />
            </div>
            <div>
              <div className="stat-label">USDT Contract (Nile)</div>
              <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>{shortHash(w?.contract, 10)}</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              This wallet locks USDT from crypto merchants during a match. Once IDR payment is confirmed,
              the equivalent (minus platform fee) is released to the fiat merchant's user wallet.
              <br />
              <br />
              <span style={{ color: "var(--escrow)" }}>Note (MVP):</span> Broadcasts are simulated
              (mock txids). For real Nile testnet transfers, fund the address with TRX + USDT and set{" "}
              <span className="mono">simulate=false</span> in <span className="mono">tron.js</span>.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><span>Network Details</span></div>
          <div style={{ padding: 20, display: "grid", gap: 12 }}>
            <MetaCell label="Network" value={(w?.network || "nile").toUpperCase()} />
            <MetaCell label="Fee Model" value="Platform 25 bps on gross USDT volume" />
            <MetaCell label="Encryption" value="AES-256-GCM · private key vaulted" />
            <MetaCell label="Confirmations required" value="1 (Nile testnet)" />
          </div>
        </div>
      </div>
    </>
  );
}

function MetaCell({ label, value }) {
  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="stat-label">{label}</div>
      <div className="mono" style={{ fontSize: 14, marginTop: 6 }}>{value}</div>
    </div>
  );
}
