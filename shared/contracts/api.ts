/**
 * Standard API Response & Error Contracts
 * Shared across Frontend, Backend, and Integration boundaries.
 */

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
    version?: string;
  };
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
    timestamp: string;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: 'connected' | 'disconnected' | 'unconfigured';
    redis?: 'connected' | 'disconnected';
    integrations: {
      twilio: 'configured' | 'mock_mode' | 'unconfigured';
      stripe: 'configured_test_mode' | 'unconfigured';
      googleCalendar: 'configured' | 'unconfigured';
      telegram: 'configured' | 'unconfigured';
    };
  };
}
