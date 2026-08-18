import { useEffect } from "react";
import { useRouter } from "next/router";

export default function IndexPage() {
  const router = useRouter();
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("p2p_token") : null;
    router.replace(token ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
