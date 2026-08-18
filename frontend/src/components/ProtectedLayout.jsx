import { Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function ProtectedLayout() {
  const token = localStorage.getItem("p2p_token");
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    </div>
  );
}
