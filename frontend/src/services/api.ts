import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/env';

// The backend serves every REST route under the versioned prefix `/api/v1`
// (e.g. `/api/v1/auth/challenge`, `/api/v1/leaderboard`). `NEXT_PUBLIC_API_URL`
// should therefore point at the `/api/v1` root, e.g.
// `http://localhost:4000/api/v1`. When unset we fall back to that same root.
const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

// Define the base configuration for API
const apiConfig = {
  baseURL: env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // CSRF guard required by the cookie-authenticated auth routes
    // (backend/src/auth/refresh-cookie.ts).
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 15000, // 15 seconds
  // Sends the HttpOnly refresh-token cookie (LF-202).
  withCredentials: true,
};

// Create axios instance with the configuration
const apiClient = axios.create(apiConfig);

// LF-202: the access token from wallet login (`POST /api/v1/auth/verify`)
// lives in memory only, and the refresh token is an HttpOnly cookie set by
// the backend. No auth token is ever written to localStorage or
// sessionStorage, so XSS can't steal a long-lived session.
let accessToken: string | null = null;

// Remove tokens that earlier versions persisted in localStorage.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('accessToken');
    window.localStorage.removeItem('refreshToken');
  } catch {
    // Storage may be unavailable (private mode, etc.) - nothing to clean.
  }
}

export const setAuthTokens = (token: string) => {
  accessToken = token;
};

export const clearAuthTokens = () => {
  accessToken = null;
};

// Request interceptor: attach the JWT from wallet login
apiClient.interceptors.request.use((config) => {
  const token = accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const refreshAccessToken = async (): Promise<string> => {
  // The refresh token rides along in the HttpOnly cookie. Uses the same
  // versioned base URL as `apiClient` (`/api/v1/auth/refresh`).
  const { data } = await axios.post<{ accessToken: string }>(
    `${apiConfig.baseURL}/auth/refresh`,
    undefined,
    {
      headers: apiConfig.headers,
      timeout: apiConfig.timeout,
      withCredentials: true,
    },
  );
  setAuthTokens(data.accessToken);
  return data.accessToken;
};

// Shared in-flight refresh so concurrent callers trigger a single refresh call
let refreshPromise: Promise<string> | null = null;
const sharedRefresh = (): Promise<string> =>
  (refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null;
  }));

/**
 * Restores the session after a page reload by exchanging the refresh cookie
 * for a new in-memory access token. Resolves to false when there's no valid
 * session.
 */
export const restoreSession = async (): Promise<boolean> => {
  try {
    // Shares the in-flight refresh: refresh tokens rotate, so two parallel
    // refreshes would trip reuse detection and revoke the session.
    await sharedRefresh();
    return true;
  } catch {
    clearAuthTokens();
    return false;
  }
};

/** Revokes the refresh-token family server-side and clears the cookie. */
export const logout = async (): Promise<void> => {
  try {
    if (accessToken) await apiClient.post('/auth/logout');
  } catch {
    // Best effort: the local session is cleared either way.
  } finally {
    clearAuthTokens();
  }
};

// Response interceptor: refresh the access token once on 401 and retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      const token = await sharedRefresh();
      original.headers.Authorization = `Bearer ${token}`;
      return apiClient(original);
    } catch {
      clearAuthTokens();
      return Promise.reject(error);
    }
  },
);

// Generic GET function
export const get = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await apiClient.get(url, config);
  return response.data;
};

// Generic POST function
export const post = async <T>(
  url: string,
  data: any,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await apiClient.post(url, data, config);
  return response.data;
};

// Generic PUT function
export const put = async <T>(
  url: string,
  data: any,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await apiClient.put(url, data, config);
  return response.data;
};

// Generic DELETE function
export const del = async <T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> => {
  const response: AxiosResponse<T> = await apiClient.delete(url, config);
  return response.data;
};

// Export the raw axios instance for advanced use cases
export default apiClient;
