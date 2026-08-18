import AdminLayout from "@/components/AdminLayout";
import Screen from "@/screens/admin/AdminApiKeysPage";
export default function Page() { return <Screen />; }
Page.getLayout = (p) => <AdminLayout>{p}</AdminLayout>;
