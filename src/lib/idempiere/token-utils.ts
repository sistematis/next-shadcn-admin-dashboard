/**
 * Token storage helpers — shared between components outside React tree.
 * Extracted from 3 duplicated copies (partner-dialog, partner-tabs-view, business-partners).
 */

const REMEMBER_KEY = "erp_remember";
const TOKEN_KEY = "erp_token";

export function getTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  const useLocal = localStorage.getItem(REMEMBER_KEY) === "true";
  const s = useLocal ? localStorage : sessionStorage;
  const raw = s.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}
