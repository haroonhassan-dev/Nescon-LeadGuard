/**
 * Roles Domain Contract
 * RBAC Role definitions scoped to Workspace.
 */

import { PermissionKey } from './permissions';

export type RoleType = 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'READ_ONLY';

export interface Role {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  type: RoleType;
  permissions: PermissionKey[];
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleDTO {
  workspaceId: string;
  name: string;
  description?: string;
  permissions: PermissionKey[];
}

export interface UpdateRoleDTO {
  name?: string;
  description?: string;
  permissions?: PermissionKey[];
}
