import ProtectedLayout from "@/components/ProtectedLayout";
import ApiKeysScreen from "@/screens/ApiKeysPage";
export default function Page() { return <ApiKeysScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
