import ProtectedLayout from "@/components/ProtectedLayout";
import OverviewScreen from "@/screens/OverviewPage";

export default function DashboardIndex() { return <OverviewScreen />; }
DashboardIndex.getLayout = (page) => <ProtectedLayout>{page}</ProtectedLayout>;
