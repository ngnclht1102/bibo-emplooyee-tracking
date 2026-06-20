import type { BusinessKind } from "./api/types";
import i18n from "./i18n";

/** Member vocabulary for a business kind. A family talks about "kids", a team
 *  about "employees". Drives all member-facing copy in the dashboard + wizard.
 *  Localized via the `common.terms` catalog. */
export interface MemberTerms {
  one: string; // "Employee" | "Kid"
  many: string; // "Employees" | "Kids"
  lowerOne: string; // "employee" | "kid"
  lowerMany: string; // "employees" | "kids"
  addCta: string; // "Add employee" | "Add kid"
  idAbbrev: string; // "emp" | "kid" — used in generated usernames (e.g. acme_emp1)
}

/** Resolve localized member terminology from a business kind. Defaults to team
 *  wording when the kind is missing (e.g. before the business has loaded). */
export function memberTerms(kind: BusinessKind | undefined | null): MemberTerms {
  const group = kind === "family" ? "family" : "team";
  const term = (k: string) => i18n.t(`terms.${group}.${k}`, { ns: "common" });
  return {
    one: term("one"),
    many: term("many"),
    lowerOne: term("lowerOne"),
    lowerMany: term("lowerMany"),
    addCta: term("addCta"),
    idAbbrev: group === "family" ? "kid" : "emp",
  };
}
