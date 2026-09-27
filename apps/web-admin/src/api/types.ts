// Shapes mirror the backend contract in docs/11-backend-and-sync.md.

export interface PublicBusiness {
  business_id: string;
  name: string;
  owner_name: string;
}

/** Persona of a self-signup owner. Personal users have no account at all. */
export type AccountType = "manager" | "parent";

export interface User {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  account_type: AccountType;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: Tokens;
}

/** A business is a team or a family; `kind` drives member wording (employees/kids). */
export type BusinessKind = "team" | "family";

/**
 * How employee screens are captured. "privacy" (the default) captures only the
 * frontmost window; "normal" captures every display in full. The backend may
 * still return pre-rename values ("full_screen"/"active_window") — normalize
 * before comparing.
 */
export type ScreenshotMode = "privacy" | "normal";

/** One category of the backend's curated sensitive-app list. */
export interface PrivacyAppCategory {
  key: string;
  apps: string[];
}

export interface Business {
  id: string;
  name: string;
  kind: BusinessKind;
  owner_user_id: string;
  screenshot_retention_days: number | null;
  screenshot_interval_s: number;
  idle_threshold_s: number;
  allow_employee_override: boolean;
  screenshot_mode: string; // normalize to ScreenshotMode before comparing
  screenshot_skip_apps: string[];
  screenshot_upload: boolean;
}

export interface BusinessSettingsPatch {
  screenshot_retention_days?: number | null;
  screenshot_interval_s?: number;
  idle_threshold_s?: number;
  allow_employee_override?: boolean;
  screenshot_mode?: ScreenshotMode;
  screenshot_skip_apps?: string[];
  screenshot_upload?: boolean;
}

export interface Employee {
  id: string;
  email: string;
  username?: string;
  display_name: string;
}

export interface CreateEmployeeResponse {
  employee: Employee;
  business: Business;
}

export interface ReportEmployee {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  role?: "owner" | "employee";
  last_seen: number | null;
  active_today_s: number;
  active_yesterday_s: number;
  screenshots_today: number;
  screenshots_yesterday: number;
  /** 0–100 share of active time with keyboard input; null when no activity today. */
  focus_pct_today: number | null;
}

export interface ActivitySample {
  ts: number;
  app_name: string;
  window_title: string;
  duration_s: number;
}

export interface AppBreakdown {
  app_name: string;
  duration_s: number;
}

export interface ActivityResponse {
  samples: ActivitySample[];
  breakdown: AppBreakdown[];
}

export interface KeystrokeBucket {
  ts_bucket: number;
  count: number;
}

export interface BrowserVisit {
  ts: number;
  url: string;
  page_title: string;
  browser: string;
  duration_s: number;
}

export interface ScreenshotMeta {
  client_uuid: string;
  ts: number;
  byte_size: number;
  width: number;
  height: number;
  display_id: number;
}

export interface ScreenshotsResponse {
  screenshots: ScreenshotMeta[];
  limit: number;
  offset: number;
}

// Thrown by the client for non-2xx responses so UIs can show inline errors.
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
