export function currentMerchant() {
  try {
    return JSON.parse(localStorage.getItem("p2p_merchant") || "null");
  } catch {
    return null;
  }
}

export function persistSession({ token, merchant }) {
  localStorage.setItem("p2p_token", token);
  localStorage.setItem("p2p_merchant", JSON.stringify(merchant));
}

export function clearSession() {
  localStorage.removeItem("p2p_token");
  localStorage.removeItem("p2p_merchant");
}

export function fmtUSDT(v) {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
export function fmtIDR(v) {
  const n = Number(v || 0);
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
export function fmtPrice(v) {
  return Number(v || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
export function shortHash(s, l = 8) {
  if (!s) return "—";
  return `${s.slice(0, l)}…${s.slice(-4)}`;
}
export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
