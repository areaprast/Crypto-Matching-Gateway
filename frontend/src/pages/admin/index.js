import AdminLayout from "@/components/AdminLayout";
import Overview from "@/screens/admin/AdminOverviewPage";
export default function Page() { return <Overview />; }
Page.getLayout = (p) => <AdminLayout>{p}</AdminLayout>;
