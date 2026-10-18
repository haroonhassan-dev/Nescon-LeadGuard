import React, { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck, Calendar, FileCode, Clock, UserPlus, Plus, Trash2, Copy } from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { inputCls } from '../components/common/FieldInput';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { backendService } from '../services/backendService';
import { BackendTeamMember } from '../types';
import { liveApi, ApiRole, AssignmentSettings, EscalationLevel } from '../services/liveApi';
import { errorMessage, onSyncRequested, requestSync } from '../services/sync';

type Tab = 'members' | 'availability' | 'roles' | 'sla' | 'audit';
type Availability = 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE';
type AuditRow = Awaited<ReturnType<typeof liveApi.audit>>['items'][number];

const card = 'bg-[#FFFFFF] border border-[#E8E1D6] rounded-xl';
const btn = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide disabled:opacity-50';
const ghost = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8F4] text-[#78716A] hover:text-[#2B2A27] text-xs border border-[#E8E1D6] disabled:opacity-50';
const label = 'block text-xs font-mono text-[#78716A] uppercase mb-1';
const availColor: Record<Availability, string> = {
  AVAILABLE: 'text-[#4F7F6D]',
  BUSY: 'text-[#B97F2E]',
  ON_LEAVE: 'text-[#78716A]',
  OFFLINE: 'text-[#B9524C]',
};

const PERMISSION_HELP: Record<string, string> = {
  'lead:read': 'See own leads',
  'lead:read_all': 'See every lead + recovery queue',
  'lead:create': 'Create leads',
  'lead:update': 'Add notes / close leads',
  'lead:claim': 'Claim unassigned leads',
  'lead:reassign': 'Reassign leads manually',
  'contact:export': 'Export contacts',
  'opportunity:export': 'Export deals',
  'opportunity:view_value': 'See deal values (else hidden)',
  'pipeline:manage': 'Edit pipelines & stages',
  'field:manage': 'Create custom fields',
  'user:manage': 'Invite & manage members',
  'role:manage': 'Edit roles & permissions',
  'assignment:manage': 'Assignment rules & others’ availability',
  'integration:manage': 'Connect / change integrations',
  'audit:read': 'Read the audit log',
  'dashboard:company': 'Company-wide dashboard',
};

export const TeamPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('members');
  const [busy, setBusy] = useState(false);

  const [team, setTeam] = useState<BackendTeamMember[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [settings, setSettings] = useState<AssignmentSettings | null>(null);
  const [draft, setDraft] = useState<AssignmentSettings | null>(null);

  const canManageUsers = hasPermission('user:manage');
  const canManageRoles = hasPermission('role:manage');
  const canManageAssignment = hasPermission('assignment:manage');
  const canReadAudit = hasPermission('audit:read');
  const isOwner = user.baseLevel === 'OWNER';

  const load = useCallback(async () => {
    try {
      setTeam((await backendService.getTeam()).items);
    } catch (err) {
      showToast('error', 'Could not load team', errorMessage(err));
    }
    if (canManageUsers || canManageRoles) {
      try {
        const p = await liveApi.permissions();
        setRoles(p.roles);
        setCatalog(p.catalog);
      } catch {
        /* no permission: roles tab stays read-only */
      }
    }
    try {
      const s = await liveApi.settings();
      setSettings(s);
      setDraft((d) => (d && d.version === s.version ? d : s));
    } catch {
      /* settings readable by every member; ignore transient errors */
    }
  }, [canManageUsers, canManageRoles, showToast]);

  useEffect(() => {
    void load();
    return onSyncRequested(() => void load());
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string, detail = 'Saved on the server.') => {
    setBusy(true);
    try {
      await fn();
      showToast('success', ok, detail);
      await load();
      requestSync();
    } catch (err) {
      showToast('error', 'Refused', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Invite ----------------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<{ email: string; level: 'USER' | 'ADMIN'; roleId: string }>({ email: '', level: 'USER', roleId: '' });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const roleId = invite.roleId || roles.find((r) => r.name === (invite.level === 'ADMIN' ? 'Admin' : 'User'))?.id || '';
      const r = await liveApi.invite(invite.email, invite.level, roleId);
      setInviteLink(r.inviteUrl);
      showToast('success', 'Invitation created', `Share the link with ${r.email}.`);
    } catch (err) {
      showToast('error', 'Invite refused', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Availability ----------------
  const setAvailability = async (m: BackendTeamMember, availability: Availability) => {
    setBusy(true);
    try {
      const r = await liveApi.setAvailability(m.userId === user.id ? 'me' : m.userId, availability);
      showToast(
        'success',
        `${m.name}: ${availability.replace('_', ' ')}`,
        r.reassigned ? `${r.reassigned} unacknowledged lead(s) reassigned immediately. ${r.policyDescription}` : r.policyDescription
      );
      await load();
      requestSync();
    } catch (err) {
      showToast('error', 'Status not changed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Roles ----------------
  const [newRoleName, setNewRoleName] = useState('');
  const togglePermission = (role: ApiRole, perm: string) => {
    const next = role.permissions.includes(perm) ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    void act(() => liveApi.updateRole(role.id, { permissions: next }), `${role.name} updated`, `${perm} ${role.permissions.includes(perm) ? 'removed' : 'granted'}.`);
  };

  // ---------------- Audit ----------------
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditFilter, setAuditFilter] = useState({ action: '', actorId: '', from: '', to: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const loadAudit = useCallback(async () => {
    if (!canReadAudit) return;
    try {
      const r = await liveApi.audit({
        page: auditPage,
        limit: 25,
        action: auditFilter.action || undefined,
        actorId: auditFilter.actorId || undefined,
        from: auditFilter.from ? new Date(auditFilter.from).toISOString() : undefined,
        to: auditFilter.to ? new Date(`${auditFilter.to}T23:59:59`).toISOString() : undefined,
      });
      setAudit(r.items);
      setAuditActions(r.availableActions);
      setAuditPages(r.pagination.totalPages);
    } catch (err) {
      showToast('error', 'Audit log not loaded', errorMessage(err));
    }
  }, [auditFilter, auditPage, canReadAudit, showToast]);
  useEffect(() => {
    if (tab === 'audit') void loadAudit();
  }, [tab, loadAudit]);

  // ---------------- Settings ----------------
  const saveSettings = () => {
    if (!draft) return;
    const { acknowledgedLeadPolicyDescription: _d, ...body } = draft;
    void act(() => liveApi.updateSettings(body), 'Assignment rules saved');
  };
  const updateLevel = (i: number, patch: Partial<EscalationLevel>) =>
    draft && setDraft({ ...draft, escalationLevels: draft.escalationLevels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const tabBtn = (id: Tab, icon: React.ReactNode, text: string) => (
    <button onClick={() => setTab(id)} className={`pb-3 border-b-2 font-medium flex items-center gap-2 whitespace-nowrap ${tab === id ? 'border-[#4F7F6D] text-[#4F7F6D]' : 'border-transparent text-[#78716A] hover:text-[#2B2A27]'}`}>
      {icon}<span>{text}</span>
    </button>
  );
  const editablePerms = catalog.length ? catalog : Object.keys(PERMISSION_HELP);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E1D6] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2B2A27]">Team, Roles & Rules</h1>
          <p className="text-xs text-[#78716A] mt-0.5">Base levels Owner / Admin / User; roles are permission sets. Every change is enforced and audited by the server.</p>
        </div>
        {canManageUsers && (
          <button className={btn} onClick={() => { setInviteLink(null); setInviteOpen(true); }}><UserPlus className="h-4 w-4" /> Invite member</button>
        )}
      </div>

      <div className="flex border-b border-[#E8E1D6] gap-4 text-xs font-mono overflow-x-auto">
        {tabBtn('members', <Users className="h-3.5 w-3.5" />, `Members (${team.length})`)}
        {tabBtn('availability', <Calendar className="h-3.5 w-3.5" />, 'Availability')}
        {(canManageRoles || canManageUsers) && tabBtn('roles', <ShieldCheck className="h-3.5 w-3.5" />, 'Roles & permissions')}
        {tabBtn('sla', <Clock className="h-3.5 w-3.5" />, 'Assignment & escalation')}
        {canReadAudit && tabBtn('audit', <FileCode className="h-3.5 w-3.5" />, 'Audit log')}
      </div>

      {/* ---------------- MEMBERS ---------------- */}
      {tab === 'members' && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#FAF8F4] border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                  <th className="py-3 px-4">Member</th><th className="py-3 px-4">Level</th><th className="py-3 px-4">Role</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Open leads</th><th className="py-3 px-4">Telegram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D6]">
                {team.map((m) => {
                  const editable = canManageUsers && m.baseLevel !== 'OWNER' && m.userId !== user.id && (isOwner || m.baseLevel !== 'ADMIN');
                  return (
                    <tr key={m.userId} className="hover:bg-[#F3EEE6]/50">
                      <td className="py-3 px-4"><div className="font-semibold text-[#2B2A27]">{m.name}{m.userId === user.id && <span className="text-[#78716A] font-normal"> (you)</span>}</div><div className="font-mono text-[10px] text-[#78716A]">{m.email ?? ''}</div></td>
                      <td className="py-3 px-4">
                        {editable && isOwner ? (
                          <select aria-label={`Level for ${m.name}`} value={m.baseLevel} disabled={busy} onChange={(e) => void act(() => liveApi.updateMember(m.userId, { baseLevel: e.target.value as 'ADMIN' | 'USER' }), 'Level changed')} className={`${inputCls} w-28`}>
                            <option value="ADMIN">ADMIN</option><option value="USER">USER</option>
                          </select>
                        ) : <span className="font-mono text-[#4F7F6D]">{m.baseLevel}</span>}
                      </td>
                      <td className="py-3 px-4">
                        {editable && roles.length ? (
                          <select aria-label={`Role for ${m.name}`} value={m.role?.id ?? ''} disabled={busy} onChange={(e) => void act(() => liveApi.updateMember(m.userId, { roleId: e.target.value }), 'Role changed')} className={`${inputCls} w-36`}>
                            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : <span className="text-[#2B2A27]">{m.role?.name ?? (m.baseLevel === 'OWNER' ? 'All permissions' : '—')}</span>}
                      </td>
                      <td className="py-3 px-4">
                        {editable ? (
                          <button className={ghost} disabled={busy} onClick={() => void act(() => liveApi.updateMember(m.userId, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }), m.status === 'ACTIVE' ? 'Member suspended (leads reassigned)' : 'Member reactivated')}>
                            {m.status === 'ACTIVE' ? 'Active · suspend' : 'Suspended · reactivate'}
                          </button>
                        ) : <span className="font-mono text-[#4F7F6D]">{m.status}</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#2B2A27]">{m.openLeads} / {m.maxOpenLeads}</td>
                      <td className="py-3 px-4">{m.telegramConfigured ? <span className="font-mono text-[10px] text-[#4F7F6D]">LINKED</span> : <span className="font-mono text-[10px] text-[#78716A]">not linked</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!isOwner && canManageUsers && <div className="p-3 text-[11px] text-[#78716A] border-t border-[#E8E1D6]">Admins cannot change the Owner or other Admins (enforced by the server).</div>}
        </div>
      )}

      {/* ---------------- AVAILABILITY ---------------- */}
      {tab === 'availability' && (
        <div className="space-y-3">
          {settings && <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-xs text-[#78716A]"><span className="text-[#2B2A27] font-semibold">Policy for acknowledged leads: </span>{settings.acknowledgedLeadPolicyDescription}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {team.filter((m) => m.status === 'ACTIVE').map((m) => {
              const canEdit = m.userId === user.id || canManageAssignment;
              return (
                <div key={m.userId} className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E8E1D6] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div><div className="font-bold text-sm text-[#2B2A27]">{m.name}</div><div className="text-[10px] font-mono text-[#78716A]">{m.role?.name ?? m.baseLevel}</div></div>
                    {canEdit ? (
                      <select aria-label={`Availability for ${m.name}`} value={m.availability} disabled={busy} onChange={(e) => void setAvailability(m, e.target.value as Availability)} className={`${inputCls} w-36 ${availColor[m.availability]}`}>
                        <option value="AVAILABLE">AVAILABLE</option><option value="BUSY">BUSY</option><option value="ON_LEAVE">ON LEAVE</option><option value="OFFLINE">OFFLINE</option>
                      </select>
                    ) : <span className={`font-mono text-xs ${availColor[m.availability]}`}>{m.availability.replace('_', ' ')}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono border-t border-[#E8E1D6] pt-2.5">
                    <div><span className="text-[#78716A] text-[10px] block">Open leads</span><span className="text-[#2B2A27]">{m.openLeads} / {m.maxOpenLeads}</span></div>
                    <div><span className="text-[#78716A] text-[10px] block">Receives new leads</span><span className={m.availability === 'AVAILABLE' && m.autoAssignEnabled ? 'text-[#4F7F6D]' : 'text-[#78716A]'}>{m.availability === 'AVAILABLE' && m.autoAssignEnabled ? 'YES' : 'NO'}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- ROLES ---------------- */}
      {tab === 'roles' && (
        <div className={`${card} p-5 space-y-4`}>
          <div>
            <h3 className="text-base font-bold text-[#2B2A27]">Permission matrix</h3>
            <p className="text-xs text-[#78716A]">
              The Owner holds every permission. Tick a box to grant or remove a permission for a role — it applies on the server immediately.
              {!canManageRoles && ' (Read only: your role cannot edit permissions.)'}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#FAF8F4] border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                  <th className="py-3 px-3">Permission</th>
                  <th className="py-3 px-3 text-center text-[#4F7F6D]">Owner</th>
                  {roles.map((r) => <th key={r.id} className="py-3 px-3 text-center text-[#4F7F6D]">{r.name}<div className="text-[9px] text-[#78716A] normal-case">{r.memberCount} member(s)</div></th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D6]">
                {editablePerms.map((perm) => (
                  <tr key={perm} className="hover:bg-[#F3EEE6]/50">
                    <td className="py-2 px-3"><div className="font-mono text-[#2B2A27]">{perm}</div>{PERMISSION_HELP[perm] && <div className="text-[10px] text-[#78716A]">{PERMISSION_HELP[perm]}</div>}</td>
                    <td className="py-2 px-3 text-center text-[#4F7F6D]">✓</td>
                    {roles.map((r) => (
                      <td key={r.id} className="py-2 px-3 text-center">
                        <input type="checkbox" aria-label={`${perm} for ${r.name}`} checked={r.permissions.includes(perm)} disabled={!canManageRoles || busy} onChange={() => togglePermission(r, perm)} className="h-4 w-4 accent-[#4F7F6D]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManageRoles && (
            <div className="flex gap-2 flex-wrap items-center pt-2 border-t border-[#E8E1D6]">
              <input aria-label="New role name" placeholder="New role name (e.g. Auditor)" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className={`${inputCls} max-w-xs`} />
              <button className={btn} disabled={!newRoleName.trim() || busy} onClick={() => { const n = newRoleName; setNewRoleName(''); void act(() => liveApi.createRole(n, ['lead:read', 'dashboard:read']), 'Role created'); }}><Plus className="h-4 w-4" /> Role</button>
              {roles.filter((r) => r.memberCount === 0 && !r.isSystem).map((r) => (
                <button key={r.id} className={ghost} disabled={busy} onClick={() => void act(() => liveApi.deleteRole(r.id), 'Role deleted')}><Trash2 className="h-3.5 w-3.5 text-[#B9524C]" /> {r.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- ASSIGNMENT & ESCALATION ---------------- */}
      {tab === 'sla' && draft && (
        <div className={`${card} p-5 space-y-5 max-w-3xl`}>
          <div>
            <h3 className="text-base font-bold text-[#2B2A27]">Assignment & escalation rules</h3>
            <p className="text-xs text-[#78716A]">Times are in seconds so escalation can be shown live. {!canManageAssignment && '(Read only for your role.)'}</p>
          </div>
          <fieldset disabled={!canManageAssignment || busy} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor="s-ack">Time to acknowledge (seconds)</label><input id="s-ack" type="number" min={5} value={draft.ackTimeoutSeconds} onChange={(e) => setDraft({ ...draft, ackTimeoutSeconds: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className={label} htmlFor="s-max">Max open leads per employee</label><input id="s-max" type="number" min={1} value={draft.maxOpenLeadsPerUser} onChange={(e) => setDraft({ ...draft, maxOpenLeadsPerUser: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className={label} htmlFor="s-backup">Designated backup</label>
                <select id="s-backup" value={draft.backupUserId ?? ''} onChange={(e) => setDraft({ ...draft, backupUserId: e.target.value || null })} className={inputCls}>
                  <option value="">None</option>{team.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select></div>
              <div><label className={label} htmlFor="s-mgr">Manager (last level)</label>
                <select id="s-mgr" value={draft.managerUserId ?? ''} onChange={(e) => setDraft({ ...draft, managerUserId: e.target.value || null })} className={inputCls}>
                  <option value="">None</option>{team.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select></div>
              <div><label className={label} htmlFor="s-idle">Recovery queue: idle after (seconds)</label><input id="s-idle" type="number" min={10} value={draft.idleThresholdSeconds} onChange={(e) => setDraft({ ...draft, idleThresholdSeconds: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className={label} htmlFor="s-esc">Recovery queue: escalated at least</label><input id="s-esc" type="number" min={1} value={draft.recoveryEscalationThreshold} onChange={(e) => setDraft({ ...draft, recoveryEscalationThreshold: Number(e.target.value) })} className={inputCls} /></div>
            </div>
            <div><label className={label} htmlFor="s-pol">When an owner goes On leave / Offline, acknowledged leads…</label>
              <select id="s-pol" value={draft.acknowledgedLeadPolicy} onChange={(e) => setDraft({ ...draft, acknowledgedLeadPolicy: e.target.value as AssignmentSettings['acknowledgedLeadPolicy'] })} className={inputCls}>
                <option value="KEEP_WITH_OWNER">stay with the owner (only unacknowledged leads move)</option>
                <option value="REASSIGN">are reassigned too</option>
              </select></div>
            <div className="space-y-2">
              <div className={label}>Escalation chain (after the first window expires)</div>
              {draft.escalationLevels.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#78716A] w-14">Level {i + 1}</span>
                  <select aria-label={`Level ${i + 1} target`} value={l.target} onChange={(e) => updateLevel(i, { target: e.target.value as EscalationLevel['target'] })} className={`${inputCls} w-48`}>
                    <option value="NEXT_ELIGIBLE">Next available employee</option><option value="BACKUP">Designated backup</option><option value="MANAGER">Manager</option>
                  </select>
                  <input aria-label={`Level ${i + 1} seconds`} type="number" min={5} value={l.timeoutSeconds} onChange={(e) => updateLevel(i, { timeoutSeconds: Number(e.target.value) })} className={`${inputCls} w-28`} />
                  <span className="text-[11px] text-[#78716A]">s</span>
                  <button aria-label={`Remove level ${i + 1}`} type="button" className={ghost} disabled={draft.escalationLevels.length <= 1} onClick={() => setDraft({ ...draft, escalationLevels: draft.escalationLevels.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button type="button" className={ghost} disabled={draft.escalationLevels.length >= 10} onClick={() => setDraft({ ...draft, escalationLevels: [...draft.escalationLevels, { target: 'MANAGER', timeoutSeconds: 60 }] })}><Plus className="h-3.5 w-3.5" /> Add level</button>
            </div>
          </fieldset>
          {canManageAssignment && (
            <div className="flex gap-2">
              <button className={btn} disabled={busy} onClick={saveSettings}>Save rules</button>
              <button className={ghost} disabled={busy} onClick={() => settings && setDraft(settings)}>Discard changes</button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- AUDIT ---------------- */}
      {tab === 'audit' && (
        <div className={`${card} overflow-hidden`}>
          <div className="p-4 border-b border-[#E8E1D6] bg-[#FAF8F4] flex flex-wrap gap-2 items-end">
            <div><label className={label} htmlFor="a-act">Event</label>
              <select id="a-act" value={auditFilter.action} onChange={(e) => { setAuditPage(1); setAuditFilter({ ...auditFilter, action: e.target.value }); }} className={`${inputCls} w-52`}>
                <option value="">All events</option>{auditActions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></div>
            <div><label className={label} htmlFor="a-user">User</label>
              <select id="a-user" value={auditFilter.actorId} onChange={(e) => { setAuditPage(1); setAuditFilter({ ...auditFilter, actorId: e.target.value }); }} className={`${inputCls} w-44`}>
                <option value="">Anyone</option>{team.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select></div>
            <div><label className={label} htmlFor="a-from">From</label><input id="a-from" type="date" value={auditFilter.from} onChange={(e) => { setAuditPage(1); setAuditFilter({ ...auditFilter, from: e.target.value }); }} className={inputCls} /></div>
            <div><label className={label} htmlFor="a-to">To</label><input id="a-to" type="date" value={auditFilter.to} onChange={(e) => { setAuditPage(1); setAuditFilter({ ...auditFilter, to: e.target.value }); }} className={inputCls} /></div>
            <span className="text-[10px] text-[#78716A] ml-auto">Entries cannot be edited or deleted.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-4">When</th><th className="py-2.5 px-4">Who</th><th className="py-2.5 px-4">Event</th><th className="py-2.5 px-4">Target</th><th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D6]">
                {audit.length === 0 && <tr><td colSpan={5} className="py-4 px-4 text-[#78716A]">No entries for these filters.</td></tr>}
                {audit.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-[#F3EEE6]/50">
                      <td className="py-2.5 px-4 font-mono text-[#78716A]">{new Date(e.createdAt).toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-[#2B2A27]">{e.actorName ?? e.actorType}<span className="text-[10px] text-[#78716A]"> ({e.actorType})</span></td>
                      <td className="py-2.5 px-4 font-mono text-[#4F7F6D]">{e.action}</td>
                      <td className="py-2.5 px-4 text-[#78716A]">{e.entityType}</td>
                      <td className="py-2.5 px-4 text-right">{(e.previousState || e.newState) ? <button className={ghost} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>{expanded === e.id ? 'Hide' : 'Before / after'}</button> : null}</td>
                    </tr>
                    {expanded === e.id && (
                      <tr><td colSpan={5} className="px-4 pb-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <pre className="p-2 rounded bg-[#FAF8F4] border border-[#E8E1D6] text-[10px] text-[#78716A] whitespace-pre-wrap break-all">Before: {JSON.stringify(e.previousState, null, 2)}</pre>
                          <pre className="p-2 rounded bg-[#FAF8F4] border border-[#E8E1D6] text-[10px] text-[#2B2A27] whitespace-pre-wrap break-all">After: {JSON.stringify(e.newState, null, 2)}</pre>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 flex items-center justify-between border-t border-[#E8E1D6] text-xs">
            <button className={ghost} disabled={auditPage <= 1} onClick={() => setAuditPage(auditPage - 1)}>Previous</button>
            <span className="font-mono text-[#78716A]">Page {auditPage} / {auditPages}</span>
            <button className={ghost} disabled={auditPage >= auditPages} onClick={() => setAuditPage(auditPage + 1)}>Next</button>
          </div>
        </div>
      )}

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a team member" subtitle="Creates a one-time join link (valid 7 days)">
        {inviteLink ? (
          <div className="space-y-3 text-xs">
            <div className="text-[#78716A]">Send this link to the person. They choose their own password.</div>
            <div className="flex items-center gap-2 p-2 rounded bg-[#FAF8F4] border border-[#4F7F6D]/30">
              <span className="text-[#4F7F6D] truncate">{inviteLink}</span>
              <button aria-label="Copy invite link" className={ghost} onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => showToast('success', 'Copied', 'Invite link copied'))}><Copy className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex justify-end"><button className={btn} onClick={() => setInviteOpen(false)}>Done</button></div>
          </div>
        ) : (
          <form onSubmit={submitInvite} className="space-y-3">
            <div><label className={label} htmlFor="inv-email">Email *</label><input id="inv-email" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="inv-level">Base level</label>
                <select id="inv-level" value={invite.level} onChange={(e) => setInvite({ ...invite, level: e.target.value as 'USER' | 'ADMIN' })} className={inputCls}>
                  <option value="USER">User</option>{isOwner && <option value="ADMIN">Admin</option>}
                </select></div>
              <div><label className={label} htmlFor="inv-role">Role</label>
                <select id="inv-role" value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })} className={inputCls}>
                  <option value="">Default for level</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
            </div>
            <div className="border-t border-[#E8E1D6] pt-3 flex justify-end gap-2">
              <button type="button" className={ghost} onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="submit" className={btn} disabled={busy}>{busy ? 'Creating…' : 'Create invite link'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
