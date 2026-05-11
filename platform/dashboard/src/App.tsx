import { useState } from "react";
import DashboardRecords from "@/components/dashboard-records";
import FocusRulesManager from "@/components/focus-rules-manager";
import HeroDemo from "@/demo";

export default function App() {
  const [view, setView] = useState<"hero" | "dashboard" | "blocking">("hero");

  if (view === "blocking") {
    return <FocusRulesManager onBack={() => setView("dashboard")} />;
  }

  if (view === "dashboard") {
    return <DashboardRecords onBack={() => setView("hero")} onOpenBlocking={() => setView("blocking")} />;
  }

  return <HeroDemo onOpenDashboard={() => setView("dashboard")} />;
}
