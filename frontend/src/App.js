import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ProtectedLayout from "@/components/ProtectedLayout";
import OverviewPage from "@/pages/OverviewPage";
import OrderBookPage from "@/pages/OrderBookPage";
import MyOrdersPage from "@/pages/MyOrdersPage";
import MatchesPage from "@/pages/MatchesPage";
import TransactionsPage from "@/pages/TransactionsPage";
import WalletPage from "@/pages/WalletPage";
import SettlementsPage from "@/pages/SettlementsPage";
import ApiKeysPage from "@/pages/ApiKeysPage";
import WebhooksPage from "@/pages/WebhooksPage";
import ExportsPage from "@/pages/ExportsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<ProtectedLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="orderbook" element={<OrderBookPage />} />
          <Route path="orders" element={<MyOrdersPage />} />
          <Route path="matches" element={<MatchesPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="settlements" element={<SettlementsPage />} />
          <Route path="apikeys" element={<ApiKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="exports" element={<ExportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
