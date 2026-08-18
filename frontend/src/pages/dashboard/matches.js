import ProtectedLayout from "@/components/ProtectedLayout";
import MatchesScreen from "@/screens/MatchesPage";
export default function Page() { return <MatchesScreen />; }
Page.getLayout = (p) => <ProtectedLayout>{p}</ProtectedLayout>;
