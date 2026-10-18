import { HealthCheckResponse } from '@shared/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  return response.json();
}
