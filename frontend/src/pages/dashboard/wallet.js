import ProtectedLayout from "@/components/ProtectedLayout";
import WalletScreen from "@/screens/WalletPage";
export default function Page() { return <WalletScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
