import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { currentMerchant, fmtUSDT, shortHash, timeAgo } from "@/lib/session";
import { toast, Toaster } from "sonner";
import { ArrowRight, CheckCircle2, Landmark, Lock } from "lucide-react";

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = () => api.matches().then((r) => setMatches(r.matches)).catch(() => {});
  useEffect(() => {
    load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const id = params.get("id");
    if (id) {
      api.match(id).then(setSelected).catch(() => {});
    }
  }, [params]);

  function openMatch(id) {
    setParams({ id });
  }

  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <Topbar title="Matches" subtitle="Pairs of TopUp ↔ Redeem orders bound via match_items." />

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
        <div className="panel" style={{ maxHeight: "calc(100vh - 160px)", overflow: "auto" }}>
          <div className="panel-h"><span>All Matches</span><span className="chip ok">{matches.length}</span></div>
          <table className="tbl" data-testid="matches-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th className="num" style={{ textAlign: "right" }}>USDT</th>
                <th className="num" style={{ textAlign: "right" }}>IDR</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No matches yet.</td></tr>
              )}
              {matches.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => openMatch(m.id)}
                  style={{ cursor: "pointer" }}
                  data-testid={`match-row-${m.reference}`}
                >
                  <td className="mono" style={{ fontSize: 11 }}>{m.reference}</td>
                  <td className="num">{fmtUSDT(m.total_crypto_amount)}</td>
                  <td className="num">{Number(m.total_fiat_amount).toLocaleString("id-ID", { maximumFractionDigits: 0 })}</td>
                  <td><StatusChip status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-h">
            <span>Match Detail</span>
            {selected && <span className="mono" style={{ fontSize: 11 }}>{selected.match.reference}</span>}
          </div>
          {!selected ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Select a match on the left to view its pecahan (sub-nominal splits) and act on it.
            </div>
          ) : (
            <MatchDetail data={selected} refresh={async () => setSelected(await api.match(selected.match.id))} />
          )}
        </div>
      </div>
    </>
  );
}

function StatusChip({ status }) {
  const map = {
    AWAITING_ESCROW: "chip warn",
    AWAITING_FIAT: "chip warn",
    RELEASED: "chip buy",
    FAILED: "chip sell",
    CANCELLED: "chip sell",
    PENDING: "chip",
    ESCROWED: "chip warn",
    FIAT_PAID: "chip warn",
  };
  return <span className={map[status] || "chip ok"}>{status}</span>;
}

function MatchDetail({ data, refresh }) {
  const m = currentMerchant();
  const [busy, setBusy] = useState(null);

  async function doEscrow(item) {
    setBusy(item.id + ":escrow");
    try {
      await api.escrow(data.match.id, item.id, "TXYZ-CRYPTO-USER-HOTWALLET-DEMO");
      toast.success("USDT escrowed to hot wallet");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Escrow failed");
    } finally { setBusy(null); }
  }
  async function doConfirmFiat(item) {
    setBusy(item.id + ":fiat");
    try {
      const r = await api.confirmFiat(data.match.id, item.id);
      toast.success(`IDR received — released ${r.released_amount} USDT · tx ${r.txid.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Confirm failed");
    } finally { setBusy(null); }
  }

  return (
    <div style={{ padding: 20, display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <MetaCell label="Total USDT" value={fmtUSDT(data.match.total_crypto_amount)} />
        <MetaCell label="Total IDR" value={Number(data.match.total_fiat_amount).toLocaleString("id-ID")} />
        <MetaCell label="Fee (USDT)" value={fmtUSDT(data.match.platform_fee_crypto)} />
        <MetaCell label="Status" value={<StatusChip status={data.match.status} />} />
      </div>

      <div>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 10 }}>
          Pecahan / Sub-Nominal Items
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {data.items.map((it) => (
            <div key={it.id} className="panel" style={{ padding: 16, background: "var(--surface-2)" }} data-testid={`item-${it.id}`}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Fiat Merchant · TopUp</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{it.topup_merchant_name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                    → {shortHash(it.destination_wallet, 8)}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <ArrowRight size={14} style={{ color: "var(--text-dim)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Crypto Merchant · Redeem</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{it.redeem_merchant_name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                    {it.destination_bank_name} · {it.destination_bank_account} · {it.destination_bank_holder}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>USDT</div>
                    <div className="mono" style={{ fontSize: 15 }}>{fmtUSDT(it.crypto_amount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em" }}>IDR</div>
                    <div className="mono" style={{ fontSize: 15 }}>{Number(it.fiat_amount).toLocaleString("id-ID")}</div>
                  </div>
                  <div>
                    <StatusChip status={it.status} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {m?.type === "CRYPTO" && it.redeem_merchant_id === m.id && it.status === "PENDING" && (
                    <button data-testid={`escrow-${it.id}`} className="btn sm" onClick={() => doEscrow(it)} disabled={busy === it.id + ":escrow"}>
                      <Lock size={12} /> Escrow USDT
                    </button>
                  )}
                  {m?.type === "CRYPTO" && it.redeem_merchant_id === m.id && it.status === "ESCROWED" && (
                    <button data-testid={`confirm-fiat-${it.id}`} className="btn sm primary" onClick={() => doConfirmFiat(it)} disabled={busy === it.id + ":fiat"}>
                      <CheckCircle2 size={12} /> Confirm IDR Received
                    </button>
                  )}
                  {m?.type === "FIAT" && it.status === "ESCROWED" && (
                    <span style={{ fontSize: 11, color: "var(--escrow)" }}>
                      <Landmark size={11} style={{ display: "inline", marginRight: 4 }} />
                      Transfer {Number(it.fiat_amount).toLocaleString("id-ID")} IDR to counterparty bank
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.transactions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 10 }}>
            On-Chain Ledger
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Direction</th>
                <th>TxID</th>
                <th className="num" style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className={t.direction === "DEPOSIT" ? "chip warn" : "chip buy"}>{t.direction}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{shortHash(t.txid, 10)}</td>
                  <td className="num">{fmtUSDT(t.amount)}</td>
                  <td><StatusChip status={t.status} /></td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value }) {
  return (
    <div className="panel" style={{ padding: 12, background: "var(--surface-2)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-muted)" }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>{value}</div>
    </div>
  );
}
