import { AdminDashboard, type RosterEntry } from "./AdminDashboard";

// The "Tổng quan nhóm" screen: the team dashboard (KPI + roster). Clicking a row's
// "View" navigates to the Members tab and opens that member's detail there — the
// selection is owned by App, so no in-place drill-down / back button here.
export function TeamOverview({
  businessId,
  businessName,
  onViewEmployee,
}: {
  businessId: string;
  businessName: string;
  onViewEmployee: (e: RosterEntry) => void;
}) {
  return (
    <AdminDashboard
      businessId={businessId}
      businessName={businessName}
      onSelectEmployee={onViewEmployee}
    />
  );
}
