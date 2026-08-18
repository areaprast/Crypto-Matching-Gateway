import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import { Filter } from "lucide-react";

export default function MerchantFilter({ value, onChange, testid = "merchant-filter" }) {
  const [merchants, setMerchants] = useState([]);
  useEffect(() => {
    adminApi.merchants().then((r) => setMerchants(r.merchants)).catch(() => {});
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Filter size={13} style={{ color: "var(--text-muted)" }} />
      <select
        data-testid={testid}
        className="select"
        style={{ minWidth: 260, padding: "8px 12px" }}
        value={value || ""}
        onChange={(e) => onChange(e.target.value || "")}
      >
        <option value="">All merchants</option>
        {merchants.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} — {m.name} ({m.type})
          </option>
        ))}
      </select>
    </div>
  );
}
