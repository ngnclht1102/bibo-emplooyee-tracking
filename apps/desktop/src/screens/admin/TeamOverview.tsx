import { useEffect, useState } from "react";
import { AdminDashboard, type RosterEntry } from "./AdminDashboard";
import { EmployeeDetail } from "./EmployeeDetail";

// The "Tổng quan nhóm" screen: the team dashboard (KPI + roster) with a native
// drill-down into one member's detail. Fits inside the app's own chrome (the
// workspace picker lives in the app topbar).
export function TeamOverview({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [selected, setSelected] = useState<RosterEntry | null>(null);

  // Switching workspace closes any open member detail (it belongs to the old one).
  useEffect(() => {
    setSelected(null);
  }, [businessId]);

  if (selected) {
    return (
      <EmployeeDetail employee={selected} onBack={() => setSelected(null)} />
    );
  }
  return (
    <AdminDashboard
      businessId={businessId}
      businessName={businessName}
      onSelectEmployee={setSelected}
    />
  );
}
