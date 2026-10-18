import { ApiResponse, ApiErrorResponse } from '@shared/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiClientError extends Error {
  public code: string;
  public details?: unknown;
  public status: number;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Token & Workspace state management in localStorage
const TOKEN_KEY = 'nescon_leadguard_auth_token';
const WORKSPACE_KEY = 'nescon_leadguard_active_ws';

let inMemoryToken: string | null = null;
let inMemoryWorkspaceId: string | null = null;

try {
  inMemoryToken = localStorage.getItem(TOKEN_KEY);
  inMemoryWorkspaceId = localStorage.getItem(WORKSPACE_KEY);
} catch {
  // SSR or restricted storage fallback
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setActiveWorkspaceId(workspaceId: string | null): void {
  inMemoryWorkspaceId = workspaceId;
  try {
    if (workspaceId) {
      localStorage.setItem(WORKSPACE_KEY, workspaceId);
    } else {
      localStorage.removeItem(WORKSPACE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getActiveWorkspaceId(): string | null {
  return inMemoryWorkspaceId;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  explicitWorkspaceId?: string
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject Bearer token if present
  const token = inMemoryToken;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Inject Workspace context header if present
  const wsId = explicitWorkspaceId || inMemoryWorkspaceId;
  if (wsId && !headers.has('X-Workspace-Id')) {
    headers.set('X-Workspace-Id', wsId);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network failure';
    throw new ApiClientError(
      `Cannot connect to backend service (${msg})`,
      'NETWORK_UNAVAILABLE',
      0
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = data as ApiErrorResponse | null;
    throw new ApiClientError(
      errorBody?.error?.message || `Request failed with status ${response.status}`,
      errorBody?.error?.code || (response.status === 501 ? 'NOT_IMPLEMENTED' : 'REQUEST_FAILED'),
      response.status,
      errorBody?.error?.details
    );
  }

  const successBody = data as ApiResponse<T>;
  return successBody.data;
}
