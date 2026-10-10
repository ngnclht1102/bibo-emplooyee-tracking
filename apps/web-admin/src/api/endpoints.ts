import { request } from "./client";
import { tokenStore } from "./tokenStore";
import {
  demoActivity,
  demoBrowser,
  demoBusinesses,
  demoEmployees,
  demoKeystrokes,
  demoRoster,
  demoScreenshots,
  isDemo,
} from "./demo";
import type {
  AccountType,
  AdminMessageRow,
  EventCounts,
  MessageDef,
  MessageStats,
  Overview,
  ActivityResponse,
  AuthResponse,
  BrowserVisit,
  Business,
  BusinessSettingsPatch,
  CreateEmployeeResponse,
  Employee,
  KeystrokeBucket,
  PrivacyAppCategory,
  ReportEmployee,
  ScreenshotsResponse,
  Tokens,
  User,
} from "./types";

// ---------- auth ----------
export async function login(identifier: string, password: string, business_id?: string) {
  const res = await request<AuthResponse>("/v1/auth/login", {
    method: "POST",
    auth: false,
    body: { identifier, password, business_id },
  });
  tokenStore.setSession(res.tokens, res.user);
  return res;
}

export async function register(
  identifier: string,
  password: string,
  display_name: string,
  account_type: AccountType = "manager",
) {
  // One field accepts an email or a username; route it to the right body key.
  const isEmail = identifier.includes("@");
  const res = await request<AuthResponse>("/v1/auth/register", {
    method: "POST",
    auth: false,
    body: {
      email: isEmail ? identifier : undefined,
      username: isEmail ? undefined : identifier.toLowerCase(),
      password,
      display_name,
      account_type,
    },
  });
  tokenStore.setSession(res.tokens, res.user);
  return res;
}

export function refresh(refresh_token: string) {
  return request<Tokens>("/v1/auth/refresh", {
    method: "POST",
    auth: false,
    body: { refresh_token },
  });
}

export function getMe() {
  return request<User>("/v1/me");
}

// ---------- businesses ----------
export function createBusiness(name: string) {
  return request<Business>("/v1/businesses", { method: "POST", body: { name } });
}

export function listMyBusinesses() {
  if (isDemo()) return Promise.resolve({ businesses: demoBusinesses });
  return request<{ businesses: Business[] }>("/v1/businesses/mine");
}

export function updateBusinessSettings(id: string, patch: BusinessSettingsPatch) {
  return request<{ status: string }>(`/v1/businesses/${id}/settings`, {
    method: "PATCH",
    body: patch,
  });
}

export function getPrivacyApps() {
  return request<{ categories: PrivacyAppCategory[] }>("/v1/public/screenshot-privacy-apps");
}

export function cleanupScreenshots(id: string, olderThanDays: number) {
  return request<{ deleted_count: number; bytes_freed: number }>(
    `/v1/businesses/${id}/screenshots/cleanup`,
    { method: "POST", query: { older_than_days: olderThanDays } },
  );
}

// ---------- employees ----------
export function createEmployee(input: {
  email?: string;
  username?: string;
  password: string;
  display_name: string;
  business_id?: string;
}) {
  return request<CreateEmployeeResponse>("/v1/employees", {
    method: "POST",
    body: input,
  });
}

export function listBusinessEmployees(businessId: string) {
  if (isDemo()) return Promise.resolve({ employees: demoEmployees() });
  return request<{ employees: Employee[] }>(`/v1/businesses/${businessId}/employees`);
}

// ---------- reports ----------
// "Today" for the roster starts at the viewer's local midnight (not the server's
// UTC day), so it matches the per-employee views, which use local dates.
export function reportEmployees(businessId: string) {
  if (isDemo()) return Promise.resolve({ employees: demoRoster() });
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return request<{ employees: ReportEmployee[] }>("/v1/reports/employees", {
    query: { business_id: businessId, day_start: Math.floor(midnight.getTime() / 1000) },
  });
}

export function reportActivity(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoActivity(employeeId));
  return request<ActivityResponse>(`/v1/reports/employees/${employeeId}/activity`, {
    query: { from, to },
  });
}

export function reportKeystrokes(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoKeystrokes(employeeId));
  return request<{ buckets: KeystrokeBucket[] }>(
    `/v1/reports/employees/${employeeId}/keystrokes`,
    { query: { from, to } },
  );
}

export function reportBrowser(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoBrowser(employeeId));
  return request<{ visits: BrowserVisit[] }>(`/v1/reports/employees/${employeeId}/browser`, {
    query: { from, to },
  });
}

export function reportScreenshots(
  employeeId: string,
  from: number,
  to: number,
  limit = 60,
  offset = 0,
) {
  if (isDemo()) return Promise.resolve(demoScreenshots(employeeId));
  return request<ScreenshotsResponse>(`/v1/reports/employees/${employeeId}/screenshots`, {
    query: { from, to, limit, offset },
  });
}

// ---------- in-app messages (super admin) ----------
export function adminListMessages() {
  return request<{ messages: AdminMessageRow[]; whatsnew: { id: string; stats: EventCounts }[] }>(
    "/v1/admin/messages",
  );
}
export function adminGetMessage(id: string) {
  return request<MessageDef>(`/v1/admin/messages/${encodeURIComponent(id)}`);
}
export function adminCreateMessage(m: MessageDef) {
  return request<{ id: string }>("/v1/admin/messages", { method: "POST", body: m });
}
export function adminUpdateMessage(m: MessageDef) {
  return request<{ id: string }>(`/v1/admin/messages/${encodeURIComponent(m.id)}`, { method: "PUT", body: m });
}
export function adminDeleteMessage(id: string) {
  return request<{ ok: boolean }>(`/v1/admin/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export function adminMessageStats(id: string) {
  return request<MessageStats>(`/v1/admin/messages/${encodeURIComponent(id)}/stats`);
}

// ---------- Business overview (super admin, ticket 149) ----------
export function adminOverview(days: 30 | 90 | 180) {
  return request<Overview>("/v1/admin/overview", { query: { days } });
}
