import ProtectedLayout from "@/components/ProtectedLayout";
import ExportsScreen from "@/screens/ExportsPage";
export default function Page() { return <ExportsScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
