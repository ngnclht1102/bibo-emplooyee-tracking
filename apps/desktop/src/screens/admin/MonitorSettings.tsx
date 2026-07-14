import { useTranslation } from "react-i18next";

// Placeholder — native capture-policy settings (screenshot mode, interval, idle,
// retention, skip-apps, cleanup) land in a later pass. Backend: PATCH
// /v1/businesses/:id/settings.
export function MonitorSettings() {
  const { t } = useTranslation();
  return <div className="card bb-adminboard__empty">{t("screens:admin.comingSoon")}</div>;
}
