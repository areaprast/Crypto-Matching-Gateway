import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("p2p_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("p2p_token");
      localStorage.removeItem("p2p_merchant");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const api = {
  login: (email, password) => client.post("/auth/login", { email, password }).then((r) => r.data),
  register: (payload) => client.post("/auth/register", payload).then((r) => r.data),
  stats: () => client.get("/stats").then((r) => r.data),
  book: () => client.get("/orders/book").then((r) => r.data),
  orders: (params = {}) => client.get("/orders", { params }).then((r) => r.data),
  createOrder: (payload) => client.post("/orders", payload).then((r) => r.data),
  cancelOrder: (id) => client.post(`/orders/${id}/cancel`).then((r) => r.data),
  matches: () => client.get("/matches").then((r) => r.data),
  match: (id) => client.get(`/matches/${id}`).then((r) => r.data),
  escrow: (matchId, itemId, fromAddress) =>
    client.post(`/matches/${matchId}/escrow`, { item_id: itemId, from_address: fromAddress }).then((r) => r.data),
  confirmFiat: (matchId, itemId) =>
    client.post(`/matches/${matchId}/confirm-fiat`, { item_id: itemId }).then((r) => r.data),
  transactions: () => client.get("/transactions").then((r) => r.data),
  settlements: () => client.get("/settlements").then((r) => r.data),
  generateSettlement: () => client.post("/settlements/generate").then((r) => r.data),
  apikeys: () => client.get("/apikeys").then((r) => r.data),
  createApiKey: (label, ip_whitelist = []) =>
    client.post("/apikeys", { label, ip_whitelist }).then((r) => r.data),
  deleteApiKey: (id) => client.delete(`/apikeys/${id}`).then((r) => r.data),
  hotWallet: () => client.get("/crypto/hot-wallet").then((r) => r.data),
  refreshHotWallet: () => client.post("/crypto/hot-wallet/refresh").then((r) => r.data),
  webhookConfig: () => client.get("/webhooks/config").then((r) => r.data),
  saveWebhookUrl: (webhook_url) => client.put("/webhooks/config", { webhook_url }).then((r) => r.data),
  rotateWebhookSecret: () => client.post("/webhooks/rotate-secret").then((r) => r.data),
  webhookDeliveries: () => client.get("/webhooks/deliveries").then((r) => r.data),
  redeliverWebhook: (id) => client.post(`/webhooks/deliveries/${id}/redeliver`).then((r) => r.data),
  exportPreview: (year, month) => client.get("/exports/ledger/preview", { params: { year, month } }).then((r) => r.data),
  exportDownloadUrl: (year, month) => `${process.env.REACT_APP_BACKEND_URL}/api/exports/ledger?year=${year}&month=${month}`,
};

export default client;
