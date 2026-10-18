/**
 * Permissions Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Client-side UI visibility guards (server-side RBAC still enforces).
 */

import { PermissionKey } from '@shared/permissions';

export function hasPermission(userPermissions: PermissionKey[] = [], required: PermissionKey): boolean {
  return userPermissions.includes(required);
}
