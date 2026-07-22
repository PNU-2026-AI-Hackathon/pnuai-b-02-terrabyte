import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'terrabyte.accessToken';
const DEFAULT_API_BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:8080'
  : 'http://localhost:8080';

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, '');

export type User = {
  id: number;
  email: string;
  nickname?: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
};

export type MeResponse = {
  user: User;
  hasDevice: boolean;
  hasCrop: boolean;
  device?: unknown;
};

type ApiErrorBody = {
  message?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      `서버에 연결할 수 없습니다. 백엔드 실행 여부와 API 주소(${API_BASE_URL})를 확인해 주세요.`,
    );
  }

  const body = await response.json().catch(() => undefined) as ApiErrorBody | T | undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    const fieldMessage = errorBody?.fieldErrors?.[0]?.message;
    throw new ApiRequestError(
      fieldMessage ?? errorBody?.message ?? '요청을 처리하지 못했습니다.',
      response.status,
    );
  }

  return body as T;
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signup(email: string, password: string, nickname: string) {
  return request<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  });
}

export function getMe(accessToken: string) {
  return request<MeResponse>('/api/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function saveAccessToken(accessToken: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(ACCESS_TOKEN_KEY, accessToken);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}

export async function loadAccessToken() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAccessToken() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}
