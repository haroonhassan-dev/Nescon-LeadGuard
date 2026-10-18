/**
 * User Domain Contract
 * Workspace member representation with role and authentication metadata.
 */

import { Role } from './roles';

export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DEACTIVATED';

export interface User {
  id: string;
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  roleId: string;
  role?: Role;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  role: Role;
}

export interface CreateUserDTO {
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
}

export interface UpdateUserDTO {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  roleId?: string;
  status?: UserStatus;
}
