/**
 * Dashboard Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Operational SLA metrics, active worker count, escalation rates, real-time lead counts.
 */

export interface DashboardMetrics {
  activeLeads: number;
  slaBreachRiskCount: number;
  escalatedToday: number;
  avgResponseTimeSeconds: number;
}

export const initialDashboardMetrics: DashboardMetrics = {
  activeLeads: 0,
  slaBreachRiskCount: 0,
  escalatedToday: 0,
  avgResponseTimeSeconds: 0,
};
