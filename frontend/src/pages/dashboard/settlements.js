import ProtectedLayout from "@/components/ProtectedLayout";
import SettlementsScreen from "@/screens/SettlementsPage";
export default function Page() { return <SettlementsScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
