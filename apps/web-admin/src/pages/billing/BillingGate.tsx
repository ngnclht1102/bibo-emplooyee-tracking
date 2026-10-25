import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Empty, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";

/** Renders a billing page for the selected team workspace; family workspaces and
 *  owners with no workspace get a short explanation instead. */
export function BillingGate({ children }: { children: (businessId: string) => ReactNode }) {
  const { t } = useTranslation("billing");
  const { selected, loading } = useBusinesses();
  if (loading) {
    return (
      <div className="admin-wrap">
        <Spinner label={t("common.loading")} />
      </div>
    );
  }
  if (!selected) {
    return (
      <div className="admin-wrap">
        <Empty>{t("common.noWorkspace")}</Empty>
      </div>
    );
  }
  if (selected.kind === "family") {
    return (
      <div className="admin-wrap">
        <Empty>{t("common.familyNoBilling")}</Empty>
      </div>
    );
  }
  return <>{children(selected.id)}</>;
}
