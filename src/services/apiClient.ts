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

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  workspaceId?: string
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  
  if (workspaceId) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = data as ApiErrorResponse | null;
    throw new ApiClientError(
      errorBody?.error?.message || `Request failed with status ${response.status}`,
      errorBody?.error?.code || 'NETWORK_ERROR',
      response.status,
      errorBody?.error?.details
    );
  }

  const successBody = data as ApiResponse<T>;
  return successBody.data;
}
