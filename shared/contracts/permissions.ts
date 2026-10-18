/**
 * Permissions Domain Contract
 * Fine-grained server-enforced permissions for Nescon-LeadGuard.
 */

export type Resource =
  | 'workspace'
  | 'user'
  | 'role'
  | 'lead'
  | 'contact'
  | 'company'
  | 'opportunity'
  | 'pipeline'
  | 'escalation'
  | 'audit'
  | 'payment'
  | 'message'
  | 'appointment'
  | 'integration'
  | 'dashboard';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'execute';

export type PermissionKey =
  // Workspace & Users
  | 'workspace:read'
  | 'workspace:update'
  | 'workspace:manage'
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  | 'role:manage'
  // Leads & Pipeline
  | 'lead:create'
  | 'lead:read'
  | 'lead:update'
  | 'lead:delete'
  | 'lead:claim'
  | 'lead:reassign'
  | 'lead:acknowledge'
  | 'lead:escalate'
  | 'pipeline:manage'
  // CRM Entities
  | 'contact:create'
  | 'contact:read'
  | 'contact:update'
  | 'contact:delete'
  | 'company:create'
  | 'company:read'
  | 'company:update'
  | 'company:delete'
  | 'opportunity:create'
  | 'opportunity:read'
  | 'opportunity:update'
  | 'opportunity:delete'
  // Integrations & Ops
  | 'integration:read'
  | 'integration:configure'
  | 'integration:test'
  | 'audit:read'
  | 'dashboard:read'
  | 'payment:create'
  | 'payment:read'
  | 'message:send'
  | 'message:read'
  | 'appointment:create'
  | 'appointment:read'
  | 'appointment:update';

export interface Permission {
  id: string;
  key: PermissionKey;
  resource: Resource;
  action: Action;
  description: string;
}
