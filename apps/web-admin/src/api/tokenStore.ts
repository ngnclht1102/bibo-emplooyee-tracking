import type { Tokens, User } from "./types";

// SECURITY / TRADEOFF NOTE (web app):
// There is no OS keychain in a browser. We keep tokens in memory for the live
// session and mirror them to localStorage so a page refresh keeps the owner
// logged in. localStorage is readable by any script on this origin, so this is
// the usual web tradeoff: convenient persistence vs. XSS exposure. We mitigate
// by keeping the SPA dependency surface small and serving it from the backend
// origin. A native (desktop) client uses the secure keychain instead.

const TOKENS_KEY = "ctracking.admin.tokens";
const USER_KEY = "ctracking.admin.user";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let user: User | null = null;

function loadFromStorage() {
  try {
    const rawT = localStorage.getItem(TOKENS_KEY);
    if (rawT) {
      const t = JSON.parse(rawT) as Tokens;
      accessToken = t.access_token ?? null;
      refreshToken = t.refresh_token ?? null;
    }
    const rawU = localStorage.getItem(USER_KEY);
    if (rawU) user = JSON.parse(rawU) as User;
  } catch {
    // corrupted storage — start clean
    accessToken = refreshToken = null;
    user = null;
  }
}
loadFromStorage();

export const tokenStore = {
  getAccess: () => accessToken,
  getRefresh: () => refreshToken,
  getUser: () => user,
  isAuthed: () => !!accessToken,

  setSession(tokens: Tokens, u: User | null) {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    if (u) {
      user = u;
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    }
  },

  // Used by the refresh flow: new tokens but the same user.
  updateTokens(tokens: Tokens) {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  },

  setUser(u: User) {
    user = u;
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  },

  clear() {
    accessToken = refreshToken = null;
    user = null;
    localStorage.removeItem(TOKENS_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
