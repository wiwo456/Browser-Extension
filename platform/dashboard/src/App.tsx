import { useState } from "react";
import DashboardRecords from "@/components/dashboard-records";
import FocusRulesManager from "@/components/focus-rules-manager";
import NotificationsManager from "@/components/notifications-manager";
import StudyModeManager from "@/components/study-mode-manager";
import HeroDemo from "@/demo";

function getInitialView(): "hero" | "dashboard" | "blocking" | "study" | "notifications" {
  if (typeof window === "undefined") {
    return "hero";
  }

  const route = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (route === "dashboard" || route === "blocking" || route === "study" || route === "notifications") {
    return route;
  }

  return "hero";
}

export default function App() {
  const [view, setView] = useState<"hero" | "dashboard" | "blocking" | "study" | "notifications">(getInitialView);

  if (view === "study") {
    return <StudyModeManager onBack={() => setView("dashboard")} />;
  }

  if (view === "blocking") {
    return <FocusRulesManager onBack={() => setView("dashboard")} />;
  }

  if (view === "notifications") {
    return <NotificationsManager onBack={() => setView("dashboard")} />;
  }

  if (view === "dashboard") {
    return (
      <DashboardRecords
        onBack={() => setView("hero")}
        onOpenBlocking={() => setView("blocking")}
        onOpenStudyMode={() => setView("study")}
        onOpenNotifications={() => setView("notifications")}
      />
    );
  }

  return <HeroDemo onOpenDashboard={() => setView("dashboard")} />;
}
