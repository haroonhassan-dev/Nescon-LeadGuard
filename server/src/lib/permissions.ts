/**
 * Server-side permission catalog.
 *
 * This is a superset of shared/contracts/permissions.ts: the statement (F1.3, F1.4) also
 * needs export, field-level value visibility and assignment-rule management. The shared
 * contract is owned by another branch and should be updated to match this list.
 */
export const PERMISSIONS = [
  // Leads
  'lead:read', // own leads
  'lead:read_all', // every lead in the workspace + recovery queue
  'lead:create',
  'lead:update',
  'lead:claim',
  'lead:reassign',
  // CRM
  'contact:read',
  'contact:create',
  'contact:update',
  'contact:delete',
  'contact:export',
  'company:read',
  'company:create',
  'company:update',
  'company:delete',
  'opportunity:read',
  'opportunity:create',
  'opportunity:update',
  'opportunity:delete',
  'opportunity:export',
  'opportunity:view_value', // F1.4 field-level protection
  'pipeline:manage',
  'field:manage',
  // Team & configuration
  'user:manage', // invite, change level / role, suspend
  'role:manage', // create roles, grant / remove permissions
  'assignment:manage', // assignment rules, escalation chain, other people's availability
  'integration:manage',
  'audit:read',
  // Dashboard
  'dashboard:read', // personal figures
  'dashboard:company', // company-wide figures
  // Messaging / payments / calendar (used by integration routes)
  'message:read',
  'message:send',
  'payment:read',
  'payment:create',
  'appointment:read',
  'appointment:create',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return ALL.has(value);
}

/** Default system roles created with every workspace. All are editable by the Owner. */
export const SYSTEM_ROLES: Array<{ name: string; description: string; permissions: Permission[] }> = [
  {
    name: 'Admin',
    description: 'Configures the workspace: pipelines, fields, assignment rules, integrations and users.',
    permissions: PERMISSIONS.filter((p) => p !== 'role:manage'),
  },
  {
    name: 'Manager',
    description: 'Supervises a team: sees all leads, the recovery queue and values, and can reassign.',
    permissions: [
      'lead:read', 'lead:read_all', 'lead:create', 'lead:update', 'lead:claim', 'lead:reassign',
      'contact:read', 'contact:create', 'contact:update', 'contact:export',
      'company:read', 'company:create', 'company:update',
      'opportunity:read', 'opportunity:create', 'opportunity:update', 'opportunity:export', 'opportunity:view_value',
      'assignment:manage', 'audit:read', 'dashboard:read', 'dashboard:company',
      'message:read', 'message:send', 'payment:read', 'payment:create', 'appointment:read', 'appointment:create',
    ],
  },
  {
    name: 'User',
    description: 'Handles their own leads and customer conversations.',
    permissions: [
      'lead:read', 'lead:create', 'lead:update', 'lead:claim',
      'contact:read', 'contact:create', 'contact:update',
      'company:read', 'company:create',
      'opportunity:read', 'opportunity:create', 'opportunity:update',
      'dashboard:read',
      'message:read', 'message:send', 'payment:read', 'payment:create', 'appointment:read', 'appointment:create',
    ],
  },
];

/** Owner implicitly holds everything; everyone else holds exactly their role's list. Fail closed. */
export function effectivePermissions(baseLevel: string, rolePermissions: string[] | null | undefined): Set<string> {
  if (baseLevel === 'OWNER') return new Set(PERMISSIONS);
  return new Set((rolePermissions ?? []).filter(isPermission));
}
