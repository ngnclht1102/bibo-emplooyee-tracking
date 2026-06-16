import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { subscribeLogout } from "../api/client";
import { tokenStore } from "../api/tokenStore";
import type { User } from "../api/types";

interface AuthState {
  user: User | null;
  isAuthed: boolean;
  setSession: (user: User) => void;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(tokenStore.getUser());
  const [isAuthed, setIsAuthed] = useState<boolean>(tokenStore.isAuthed());

  useEffect(() => {
    // The API client emits a logout when a refresh fails.
    return subscribeLogout(() => {
      setUser(null);
      setIsAuthed(false);
    });
  }, []);

  const value: AuthState = {
    user,
    isAuthed,
    setSession: (u) => {
      tokenStore.setUser(u);
      setUser(u);
      setIsAuthed(true);
    },
    logout: () => {
      tokenStore.clear();
      setUser(null);
      setIsAuthed(false);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
