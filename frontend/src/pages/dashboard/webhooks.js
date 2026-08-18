import ProtectedLayout from "@/components/ProtectedLayout";
import WebhooksScreen from "@/screens/WebhooksPage";
export default function Page() { return <WebhooksScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
