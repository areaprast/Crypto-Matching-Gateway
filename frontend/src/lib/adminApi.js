import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api/admin`;
const client = axios.create({ baseURL: API });

client.interceptors.request.use((c) => {
  if (typeof window !== "undefined") {
    const t = localStorage.getItem("p2p_admin_token");
    if (t) c.headers.Authorization = `Bearer ${t}`;
  }
  return c;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("p2p_admin_token");
      localStorage.removeItem("p2p_admin");
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(err);
  }
);

export const adminApi = {
  login: (email, password) => client.post("/auth/login", { email, password }).then((r) => r.data),
  stats: () => client.get("/stats").then((r) => r.data),
  merchants: () => client.get("/merchants").then((r) => r.data),
  setMerchantStatus: (id, status) => client.patch(`/merchants/${id}/status`, { status }).then((r) => r.data),
  orders: (params = {}) => client.get("/orders", { params }).then((r) => r.data),
  matches: (params = {}) => client.get("/matches", { params }).then((r) => r.data),
  match: (id) => client.get(`/matches/${id}`).then((r) => r.data),
  transactions: (params = {}) => client.get("/transactions", { params }).then((r) => r.data),
  settlements: (params = {}) => client.get("/settlements", { params }).then((r) => r.data),

  wallets: () => client.get("/wallets").then((r) => r.data),
  deleteWallet: (id) => client.delete(`/wallets/${id}`).then((r) => r.data),
  setWalletBalance: (id, balance_cache) => client.patch(`/wallets/${id}/balance`, { balance_cache }).then((r) => r.data),

  apikeys: (merchant_id) => client.get("/apikeys", { params: merchant_id ? { merchant_id } : {} }).then((r) => r.data),
  createApiKey: (merchant_id, label, ip_whitelist = []) =>
    client.post("/apikeys", { merchant_id, label, ip_whitelist }).then((r) => r.data),
  patchApiKey: (id, patch) => client.patch(`/apikeys/${id}`, patch).then((r) => r.data),
  deleteApiKey: (id) => client.delete(`/apikeys/${id}`).then((r) => r.data),

  webhookMerchants: () => client.get("/webhooks").then((r) => r.data),
  setWebhookUrl: (merchant_id, webhook_url) =>
    client.put(`/webhooks/${merchant_id}`, { webhook_url }).then((r) => r.data),
  rotateWebhookSecret: (merchant_id) =>
    client.post(`/webhooks/${merchant_id}/rotate-secret`).then((r) => r.data),
  webhookDeliveries: (merchant_id) =>
    client.get(`/webhooks/${merchant_id}/deliveries`).then((r) => r.data),
  redeliverWebhook: (id) =>
    client.post(`/webhooks/deliveries/${id}/redeliver`).then((r) => r.data),
};

export function currentAdmin() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("p2p_admin") || "null"); } catch { return null; }
}
export function persistAdmin({ token, admin }) {
  localStorage.setItem("p2p_admin_token", token);
  localStorage.setItem("p2p_admin", JSON.stringify(admin));
}
export function clearAdmin() {
  localStorage.removeItem("p2p_admin_token");
  localStorage.removeItem("p2p_admin");
}
