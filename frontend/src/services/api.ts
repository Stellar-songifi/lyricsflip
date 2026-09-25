import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

// Define the base configuration for API
const apiConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000, // 15 seconds
};

// Create axios instance with the configuration
const apiClient = axios.create(apiConfig);

// Tokens issued by wallet login (`POST /auth/sign-in`) are kept in localStorage.
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const readToken = (key: string): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(key);

export const setAuthTokens = (accessToken: string, refreshToken?: string) => {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken)
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearAuthTokens = () => {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Request interceptor: attach the JWT from wallet login
apiClient.interceptors.request.use((config) => {
  const token = readToken(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Shared in-flight refresh so concurrent 401s trigger a single refresh call
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = readToken(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post<{ accessToken: string }>(
    `${apiConfig.baseURL}/auth/refresh`,
    { refreshToken },
    { headers: apiConfig.headers, timeout: apiConfig.timeout },
  );
  setAuthTokens(data.accessToken);
  return data.accessToken;
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
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const token = await refreshPromise;
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
