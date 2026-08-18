import ProtectedLayout from "@/components/ProtectedLayout";
import OrderBookScreen from "@/screens/OrderBookPage";

export default function Page() { return <OrderBookScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
