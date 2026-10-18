/**
 * Auth Feature Module Scaffold
 * OWNED BY: FRONTEND DEVELOPER
 * Scope: Sign in form, JWT bearer token storage, session context.
 */

import { UserProfile } from '@shared/user';

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  activeWorkspaceId: string;
}

export const authInitialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  activeWorkspaceId: 'default-workspace-001',
};
