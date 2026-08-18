import ProtectedLayout from "@/components/ProtectedLayout";
import TransactionsScreen from "@/screens/TransactionsPage";
export default function Page() { return <TransactionsScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
