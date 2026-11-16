// Anmeldung über die eigene API (Cookie-Sitzung). Gleiche Schnittstelle wie bisher (useAuth).
import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { base44, api } from "@/api/base44Client";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      setUser(await api("/me"));
    } catch {
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    base44.auth.logout(shouldRedirect ? "/" : undefined);
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      isAuthenticated: !!user,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin: () => base44.auth.redirectToLogin(window.location.href),
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
