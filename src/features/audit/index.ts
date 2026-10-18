/**
 * Audit Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Audit trail log viewer, diff visualizer, actor filtering.
 */

import { AuditEvent } from '@shared/audit';

export interface AuditModuleState {
  events: AuditEvent[];
  isLoading: boolean;
}

export const auditInitialState: AuditModuleState = {
  events: [],
  isLoading: false,
};
