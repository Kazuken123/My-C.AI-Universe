export const TOKEN_STORAGE_KEY = 'cai_auth_token';
export const TOKEN_COOKIE_NAME = 'cai_auth_token';
export const COOKIE_MAX_AGE_SECONDS = 604800; // 7 days

/**
 * Retrieves the JWT session token safely across browser and server contexts
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const localToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (localToken) return localToken;

    // Fallback: Check document cookie
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        localStorage.setItem(TOKEN_STORAGE_KEY, decoded);
        return decoded;
      }
    }
  } catch {
    // Storage access blocked by browser policy
  }

  return null;
}

/**
 * Synchronously writes the auth token to both localStorage and cookie
 */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      if (typeof document !== 'undefined') {
        document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
      }
    } else {
      removeAuthToken();
    }
  } catch {
    // Storage access blocked
  }
}

/**
 * Synchronously removes the token from both localStorage and cookie
 */
export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    if (typeof document !== 'undefined') {
      document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    // Storage access blocked
  }
}

/**
 * Validates whether a token has expired based on its embedded exp timestamp (in milliseconds)
 */
export function isTokenExpired(token: string): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    if (!payload.exp) return false;
    // Backend exp is in milliseconds (Date.now() + TOKEN_TTL_MS)
    return Date.now() >= payload.exp;
  } catch {
    return true;
  }
}

/**
 * Server-side helper to extract token from incoming cookie string
 */
export function extractTokenFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE_NAME}=([^;]+)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}
