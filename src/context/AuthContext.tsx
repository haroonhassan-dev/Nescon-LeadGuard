import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@shared/user';
import { Workspace } from '@shared/workspace';
import { PermissionKey } from '@shared/permissions';
import { DEMO_PERSONAS } from '../mock/seedData';
import { appStore } from '../services/store';
import { setAuthToken, setActiveWorkspaceId } from '../services/apiClient';
import { backendService, LoginResponseData } from '../services/backendService';
import { WorkspaceMembership, BaseRoleLevel } from '../types';

export interface ExtendedUserProfile extends UserProfile {
  baseLevel: BaseRoleLevel;
  permissions: string[];
}

interface AuthContextType {
  user: ExtendedUserProfile;
  workspace: Workspace;
  workspaces: Workspace[];
  memberships: WorkspaceMembership[];
  token: string | null;
  isAuthenticated: boolean;
  isSessionExpired: boolean;
  hasPermission: (permission: PermissionKey | string) => boolean;
  canViewOpportunityValues: boolean;
  switchPersona: (personaKey: 'owner' | 'admin' | 'manager' | 'agent' | 'readonly') => void;
  switchWorkspace: (workspaceId: string) => void;
  signupWorkspace: (companyName: string, firstName: string, lastName: string, email: string, password?: string) => Promise<Workspace>;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  dismissSessionExpired: () => void;
  simulateSessionExpiry: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_PERSONA_KEY = 'nescon_leadguard_auth_persona';
const AUTH_MEMBERSHIPS_KEY = 'nescon_leadguard_memberships';
const AUTH_USER_KEY = 'nescon_leadguard_auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [personaKey, setPersonaKey] = useState<string>(() => {
    return localStorage.getItem(AUTH_PERSONA_KEY) || 'admin';
  });

  const getInitialUser = (key: string): ExtendedUserProfile => {
    const p = DEMO_PERSONAS[key] || DEMO_PERSONAS.admin;
    const baseLevel: BaseRoleLevel =
      key === 'owner' ? 'OWNER' : key === 'admin' ? 'ADMIN' : 'USER';
    return {
      ...p,
      baseLevel,
      permissions: p.role?.permissions || [],
    };
  };

  const [currentUser, setCurrentUser] = useState<ExtendedUserProfile>(() => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return getInitialUser(personaKey);
  });
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(appStore.getActiveWorkspace());
  const [workspaces, setWorkspaces] = useState<Workspace[]>(appStore.getWorkspaces());
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>(() => {
    try {
      const raw = localStorage.getItem(AUTH_MEMBERSHIPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem('nescon_leadguard_auth_token') || null;
  });
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);

  // After a reload, restore the real workspace from the saved login membership.
  useEffect(() => {
    if (memberships[0] && appStore.getActiveWorkspace().id !== memberships[0].workspaceId) {
      appStore.setWorkspaceFromMembership(memberships[0]);
    }
  }, [memberships]);

  // Sync workspace and store changes
  useEffect(() => {
    const unsub = appStore.subscribe(() => {
      setActiveWorkspace(appStore.getActiveWorkspace());
      setWorkspaces(appStore.getWorkspaces());
    });
    return unsub;
  }, []);

  // Update token helper
  const updateToken = useCallback((newToken: string | null) => {
    setTokenState(newToken);
    setAuthToken(newToken);
  }, []);

  const switchPersona = useCallback((key: 'owner' | 'admin' | 'manager' | 'agent' | 'readonly') => {
    const target = DEMO_PERSONAS[key];
    if (target) {
      setPersonaKey(key);
      const baseLevel: BaseRoleLevel =
        key === 'owner' ? 'OWNER' : key === 'admin' ? 'ADMIN' : 'USER';

      const extUser: ExtendedUserProfile = {
        ...target,
        baseLevel,
        permissions: target.role?.permissions || [],
      };

      setCurrentUser(extUser);
      localStorage.setItem(AUTH_PERSONA_KEY, key);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(extUser));
      setIsSessionExpired(false);
      updateToken(`bearer_session_${key}`);
    }
  }, [updateToken]);

  const switchWorkspace = useCallback((id: string) => {
    appStore.setActiveWorkspaceId(id);
    setActiveWorkspaceId(id);
    setActiveWorkspace(appStore.getActiveWorkspace());
  }, []);

  const signupWorkspace = useCallback(
    async (
      companyName: string,
      firstName: string,
      lastName: string,
      email: string,
      password = ''
    ): Promise<Workspace> => {
      // Real backend signup - no fake fallback allowed per Priority 1
      const res = await backendService.signup({
        workspaceName: companyName,
        firstName,
        lastName,
        email,
        password,
      });

      updateToken(res.token);
      setMemberships(res.memberships);
      localStorage.setItem(AUTH_MEMBERSHIPS_KEY, JSON.stringify(res.memberships));

      const activeMembership = res.memberships[0];
      if (activeMembership) {
        setActiveWorkspaceId(activeMembership.workspaceId);
        appStore.setWorkspaceFromMembership(activeMembership);
      }

      const newWs: Workspace = {
        id: res.workspace.id,
        name: res.workspace.name,
        slug: res.workspace.slug,
        domain: `${res.workspace.slug}.nescon.io`,
        settings: {
          defaultTimezone: 'UTC',
          defaultCurrency: 'USD',
          defaultAcknowledgementTimeoutMinutes: 15,
          maxEscalationLevels: 3,
          autoAssignmentEnabled: true,
          webhookRetryLimit: 5,
          businessHours: [],
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const extUser: ExtendedUserProfile = {
        id: res.user.id,
        workspaceId: res.workspace.id,
        email: res.user.email,
        firstName: res.user.firstName,
        lastName: res.user.lastName,
        fullName: `${res.user.firstName} ${res.user.lastName}`.trim(),
        baseLevel: 'OWNER',
        permissions: activeMembership ? activeMembership.permissions : [],
        role: {
          id: 'role_owner',
          workspaceId: res.workspace.id,
          name: 'Workspace Owner',
          type: 'OWNER',
          description: 'Tenant Owner',
          permissions: activeMembership ? (activeMembership.permissions as PermissionKey[]) : [],
          isSystemRole: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      setCurrentUser(extUser);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(extUser));
      setActiveWorkspace(newWs);
      return newWs;
    },
    [updateToken]
  );

  const login = useCallback(
    async (email: string, password = ''): Promise<boolean> => {
      // Real backend login - no fake fallback allowed per Priority 1
      const res: LoginResponseData = await backendService.login(email, password);
      updateToken(res.token);
      setMemberships(res.memberships);
      localStorage.setItem(AUTH_MEMBERSHIPS_KEY, JSON.stringify(res.memberships));

      const activeMembership = res.memberships[0];
      if (activeMembership) {
        setActiveWorkspaceId(activeMembership.workspaceId);
        appStore.setWorkspaceFromMembership(activeMembership);
        const extUser: ExtendedUserProfile = {
          id: res.user.id,
          workspaceId: activeMembership.workspaceId,
          email: res.user.email,
          firstName: res.user.firstName,
          lastName: res.user.lastName,
          fullName: `${res.user.firstName} ${res.user.lastName}`.trim(),
          baseLevel: activeMembership.baseLevel,
          permissions: activeMembership.permissions,
          role: {
            id: activeMembership.role?.id || `role_${activeMembership.baseLevel.toLowerCase()}`,
            workspaceId: activeMembership.workspaceId,
            name: activeMembership.role?.name || activeMembership.baseLevel,
            type: activeMembership.baseLevel === 'OWNER' ? 'OWNER' : activeMembership.baseLevel === 'ADMIN' ? 'ADMIN' : 'AGENT',
            description: activeMembership.role?.name || activeMembership.baseLevel,
            permissions: activeMembership.permissions as PermissionKey[],
            isSystemRole: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
        setCurrentUser(extUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(extUser));
      }

      setIsSessionExpired(false);
      return true;
    },
    [updateToken]
  );

  const logout = useCallback(async () => {
    try {
      await backendService.logout();
    } catch {
      // Ignore network errors on logout
    }
    updateToken(null);
    setActiveWorkspaceId(null);
    setMemberships([]);
    localStorage.removeItem(AUTH_MEMBERSHIPS_KEY);
    localStorage.removeItem(AUTH_PERSONA_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    appStore.clearAll();
    setIsSessionExpired(false);
  }, [updateToken]);

  const hasPermission = useCallback(
    (permission: PermissionKey | string): boolean => {
      if (!currentUser) return false;
      // Owner holds every permission implicitly (P0 RBAC rule)
      if (currentUser.baseLevel === 'OWNER') return true;
      // Everyone else: exactly the effective permissions the server returned at login
      return (
        currentUser.permissions?.includes(permission as string) ||
        currentUser.role?.permissions?.includes(permission as PermissionKey) ||
        false
      );
    },
    [currentUser]
  );

  // Requirement: Opportunity value visibility protected by role and permission
  const canViewOpportunityValues = hasPermission('opportunity:view_value');

  const simulateSessionExpiry = useCallback(() => {
    setIsSessionExpired(true);
    updateToken(null);
  }, [updateToken]);

  const dismissSessionExpired = useCallback(() => {
    setIsSessionExpired(false);
    updateToken('bearer_refreshed_session_token');
  }, [updateToken]);

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        workspace: activeWorkspace,
        workspaces,
        memberships,
        token,
        isAuthenticated: !!token && !isSessionExpired,
        isSessionExpired,
        hasPermission,
        canViewOpportunityValues,
        switchPersona,
        switchWorkspace,
        signupWorkspace,
        login,
        logout,
        dismissSessionExpired,
        simulateSessionExpiry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
