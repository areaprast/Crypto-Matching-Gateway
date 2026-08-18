import ProtectedLayout from "@/components/ProtectedLayout";
import MyOrdersScreen from "@/screens/MyOrdersPage";
export default function Page() { return <MyOrdersScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
