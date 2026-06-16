import { useCallback, useEffect, useState } from "react";
import { listMyBusinesses } from "./api/endpoints";
import type { Business } from "./api/types";

const SELECTED_KEY = "ctracking.admin.selectedBusiness";

// Loads the owner's businesses and tracks a selected one (persisted), shared by
// the Dashboard, Employees, and Settings pages.
export function useBusinesses() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMyBusinesses();
      setBusinesses(res.businesses);
      setSelectedIdState((cur) => {
        if (cur && res.businesses.some((b) => b.id === cur)) return cur;
        return res.businesses[0]?.id ?? null;
      });
    } catch {
      setError("Could not load businesses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setSelectedId = useCallback((id: string) => {
    localStorage.setItem(SELECTED_KEY, id);
    setSelectedIdState(id);
  }, []);

  const selected = businesses.find((b) => b.id === selectedId) ?? null;

  return { businesses, selected, selectedId: selected?.id ?? null, setSelectedId, loading, error, reload };
}
