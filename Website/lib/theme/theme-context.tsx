"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "applenext-theme";

interface ThemeContextValue {
  /** What the visitor picked — "system" until they use the toggle. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  theme: ResolvedTheme;
  /** False until the client has hydrated (avoids SSR/client icon mismatch). */
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  // Adopt whatever the pre-paint script already decided.
  useEffect(() => {
    const storedPreference = readStoredPreference();
    const resolved: ResolvedTheme =
      storedPreference === "system" ? systemTheme() : storedPreference;

    setPreferenceState(storedPreference);
    setTheme(resolved);
    applyTheme(resolved);
    setReady(true);
  }, []);

  // Follow the OS while the visitor hasn't made an explicit choice.
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      const next: ResolvedTheme = event.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    const resolved: ResolvedTheme = next === "system" ? systemTheme() : next;

    setPreferenceState(next);
    setTheme(resolved);
    applyTheme(resolved);

    if (typeof window !== "undefined") {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [setPreference, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, ready, setPreference, toggleTheme }),
    [preference, theme, ready, setPreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}

/**
 * Runs before first paint so the correct theme is on <html> immediately —
 * no white flash for dark-mode visitors.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=(s==="light"||s==="dark")?s:(m?"dark":"light");var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}catch(_){}})();`;
