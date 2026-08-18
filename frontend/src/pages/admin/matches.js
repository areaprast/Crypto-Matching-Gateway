import AdminLayout from "@/components/AdminLayout";
import Screen from "@/screens/admin/AdminMatchesPage";
export default function Page() { return <Screen />; }
Page.getLayout = (p) => <AdminLayout>{p}</AdminLayout>;
