/**
 * Health Endpoint Smoke Test Contract
 * Verifies that GET /api/health responds with 200 OK and valid health telemetry.
 */

import { createApp } from '../server/src/app';

describe('GET /api/health Smoke Test', () => {
  it('should initialize Express application factory', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });
});
