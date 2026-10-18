import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Clock, DollarSign, UserCheck, Layers, ArrowRight, SlidersHorizontal, Flame, ShieldAlert } from 'lucide-react';
import { Lead } from '@shared/lead';
import { EmployeeAvailability } from '@shared/availability';
import { User } from '@shared/user';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { Modal } from '../components/common/Modal';
import { WidgetPreferences } from '../types';
import { useAuth } from '../context/AuthContext';
import { liveApi, DashboardSummary } from '../services/liveApi';
import { onSyncRequested } from '../services/sync';

interface DashboardPageProps {
  leads: Lead[];
  availabilities: EmployeeAvailability[];
  users: User[];
  onDrillDown: (target: 'leads_overdue' | 'leads_today' | 'crm_pipeline' | 'appointments') => void;
}

const DEFAULT_PREFERENCES: WidgetPreferences = {
  showKpis: true,
  showPipelineChart: true,
  showEscalations: true,
  showAvailability: true,
  showAppointments: true,
  showRecentLeads: true,
};

const card = 'border border-[#242E30] bg-[#171E1F] rounded-xl';
const money = (n: number, currency = 'USD') =>
  n.toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Every figure comes from GET /api/dashboard/summary: computed on the server from stored records
 * with the statement's definitions, and scoped by role (F5.1–F5.4). Preferences persist (F5.5).
 */
export const DashboardPage: React.FC<DashboardPageProps> = ({ leads, availabilities, users, onDrillDown }) => {
  const { workspace } = useAuth();
  const [preferences, setPreferences] = useState<WidgetPreferences>(() => {
    try {
      const saved = localStorage.getItem('nescon_widget_preferences');
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);
  const savePreferences = (p: WidgetPreferences) => {
    setPreferences(p);
    try {
      localStorage.setItem('nescon_widget_preferences', JSON.stringify(p));
    } catch {
      /* storage unavailable: preference lasts for this session */
    }
  };

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setSummary(await liveApi.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load dashboard');
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    const off = onSyncRequested(() => void load());
    return () => {
      clearInterval(timer);
      off();
    };
  }, [load]);

  const f = summary?.figures;
  const stages = f?.openPipelineValueByStage ?? null;
  const pipelineTotal = stages ? stages.reduce((s, x) => s + x.total, 0) : 0;
  const pipelineDeals = stages ? stages.reduce((s, x) => s + x.opportunities, 0) : 0;
  const collected = f?.paymentsReceivedThisMonth ?? null;
  const collectedCents = collected ? collected.reduce((s, r) => s + r.collectedCents, 0) : 0;
  const collectedCount = collected ? collected.reduce((s, r) => s + r.payments, 0) : 0;
  const avg = f?.averageFirstResponseSeconds ?? null;
  const avgText = avg === null ? '—' : avg < 60 ? `${avg}s` : `${Math.floor(avg / 60)}m ${avg % 60}s`;
  const availableCount = f?.availability ? f.availability.AVAILABLE ?? 0 : availabilities.filter((a) => a.status === 'AVAILABLE').length;
  const totalEmployees = f?.availability ? Object.values(f.availability).reduce((a, b) => a + b, 0) : availabilities.length;
  const recovery = f?.recoveryQueue;
  const nameOf = (id?: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'Unassigned';
  };
  const openLeads = leads.filter((l) => (l.status as string) !== 'CLOSED');

  const kpi = (opts: { label: string; value: React.ReactNode; note: React.ReactNode; icon: React.ReactNode; onClick?: () => void; alert?: boolean }) => (
    <div
      onClick={opts.onClick}
      className={`${opts.onClick ? 'cursor-pointer' : ''} rounded-xl p-4 border transition-all group ${
        opts.alert ? 'bg-[#FF5C5C]/5 border-[#FF5C5C]/40 hover:border-[#FF5C5C]' : 'bg-[#171E1F] border-[#242E30] hover:border-[#B7F45B]/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#8E9B9A] uppercase tracking-wider">{opts.label}</span>
        <div className="p-1.5 rounded-lg bg-[#0D1112] text-[#B7F45B] border border-[#242E30]">{opts.icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold font-mono text-[#F5F7F2]">{opts.value}</div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E9B9A]">
        <span>{opts.note}</span>
        {opts.onClick && <ArrowRight className="h-3.5 w-3.5 group-hover:text-[#B7F45B]" />}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242E30] pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7F2]">Operations Dashboard</h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#B7F45B]/10 border border-[#B7F45B]/30 text-[#B7F45B] px-2 py-0.5 rounded">
              {summary ? `${summary.scope === 'company' ? 'COMPANY-WIDE' : 'MY FIGURES'} · LIVE` : 'LOADING'}
            </span>
          </div>
          <p className="text-xs text-[#8E9B9A] mt-0.5">
            Live figures from stored records for <span className="text-[#F5F7F2] font-semibold">{workspace.name}</span>
            {summary && <> · updated {new Date(summary.generatedAt).toLocaleTimeString()}</>}
          </p>
          {error && <p className="text-xs text-[#FF5C5C] mt-1">Could not load figures: {error}</p>}
        </div>
        <button
          onClick={() => setIsPrefModalOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#171E1F] hover:bg-[#1F282A] text-xs font-mono text-[#8E9B9A] hover:text-[#F5F7F2] border border-[#242E30] self-start sm:self-auto"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#B7F45B]" /> Customize Widgets
        </button>
      </div>

      {preferences.showKpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpi({
              label: 'Recovery Queue',
              value: recovery === null || recovery === undefined ? '—' : (
                <span className="flex items-baseline gap-2">
                  {recovery}
                  {recovery > 0 && <span className="text-xs text-[#FF5C5C] flex items-center gap-0.5"><Flame className="h-3 w-3" /> NEEDS ACTION</span>}
                </span>
              ),
              note: recovery === null ? 'Visible to managers' : 'Overdue, escalated or idle leads',
              icon: <ShieldAlert className="h-4 w-4 text-[#FF5C5C]" />,
              onClick: () => onDrillDown('leads_overdue'),
              alert: !!recovery,
            })}
            {kpi({
              label: 'New Leads Today',
              value: f?.newLeadsToday ?? '—',
              note: f ? `${f.awaitingAcknowledgement} awaiting acknowledgement` : 'Loading…',
              icon: <Activity className="h-4 w-4" />,
              onClick: () => onDrillDown('leads_today'),
            })}
            {kpi({
              label: 'Open Pipeline Value',
              value: <span className="text-xl">{stages === null ? '$•••,••• (hidden)' : money(pipelineTotal)}</span>,
              note: stages === null ? 'Requires the value permission' : `${pipelineDeals} open deals (not won/lost)`,
              icon: <Layers className="h-4 w-4" />,
              onClick: () => onDrillDown('crm_pipeline'),
            })}
            {kpi({
              label: 'Collected This Month',
              value: <span className="text-xl text-[#B7F45B]">{collected === null ? '$•••' : money(collectedCents / 100)}</span>,
              note: collected === null ? 'Requires the value permission' : `${collectedCount} Stripe-confirmed payment(s), refunds deducted`,
              icon: <DollarSign className="h-4 w-4" />,
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#8E9B9A]">Avg First Response</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">{avgText}</div>
              <div className="text-[10px] text-[#B7F45B] mt-0.5">First assignment → first acknowledgement · {f?.firstResponseSampleSize ?? 0} leads</div>
            </div>
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#8E9B9A]">Escalations (24h)</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">{f?.escalationsLast24h ?? '—'}</div>
              <div className="text-[10px] text-[#8E9B9A] mt-0.5">Automatic reassignments after a timeout</div>
            </div>
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#8E9B9A]">Available Now</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">{availableCount} / {totalEmployees}</div>
              <div className="text-[10px] text-[#B7F45B] mt-0.5">Only Available staff receive leads</div>
            </div>
            <div onClick={() => onDrillDown('appointments')} className={`${card} p-3.5 cursor-pointer hover:border-[#B7F45B]/40`}>
              <div className="text-[11px] font-mono text-[#8E9B9A]">Upcoming Appointments</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">{summary ? summary.upcomingAppointmentsNext7Days : '—'}</div>
              <div className="text-[10px] text-[#8E9B9A] mt-0.5">Next 7 days · Google Calendar</div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {preferences.showPipelineChart && (
          <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Open Pipeline by Stage</h3>
                <p className="text-xs text-[#8E9B9A]">Deals not in a won or lost stage</p>
              </div>
              <button onClick={() => onDrillDown('crm_pipeline')} className="text-xs font-mono text-[#B7F45B] hover:underline flex items-center gap-1">
                Open pipeline <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-3 pt-2">
              {stages === null ? (
                <div className="text-xs text-[#8E9B9A]">Deal values are hidden for your role.</div>
              ) : stages.length === 0 ? (
                <div className="text-xs text-[#8E9B9A]">No open deals yet. Create one in the CRM.</div>
              ) : (
                stages.map((st) => {
                  const max = Math.max(...stages.map((x) => x.total), 1);
                  return (
                    <div key={st.stageId + st.currency} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#F5F7F2]">{st.stage}</span>
                        <span className="font-mono text-[#8E9B9A]">{st.opportunities} deals • {money(st.total, st.currency)}</span>
                      </div>
                      <div className="h-2 w-full bg-[#0D1112] rounded-full overflow-hidden border border-[#242E30]">
                        <div className="h-full rounded-full bg-[#B7F45B]" style={{ width: `${Math.max(6, (st.total / max) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {preferences.showAvailability && (
          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Team Availability</h3>
                <p className="text-xs text-[#8E9B9A]">Status, open leads and alert channel</p>
              </div>
              <UserCheck className="h-4 w-4 text-[#B7F45B]" />
            </div>
            <div className="space-y-2.5">
              {availabilities.length === 0 && <div className="text-xs text-[#8E9B9A]">No team data yet.</div>}
              {availabilities.map((a) => {
                const colors: Record<string, string> = {
                  AVAILABLE: 'text-[#B7F45B] border-[#B7F45B]/30 bg-[#B7F45B]/10',
                  BUSY: 'text-[#F5A623] border-[#F5A623]/30 bg-[#F5A623]/10',
                  AWAY: 'text-[#8E9B9A] border-[#8E9B9A]/30 bg-[#8E9B9A]/10',
                  OFFLINE: 'text-[#FF5C5C] border-[#FF5C5C]/30 bg-[#FF5C5C]/10',
                };
                return (
                  <div key={a.id} className="p-2.5 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#F5F7F2] truncate">{nameOf(a.userId)}</div>
                      <div className="text-[10px] text-[#8E9B9A] truncate">{a.statusReason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${colors[a.status]}`}>
                        {a.status === 'AWAY' ? 'ON LEAVE' : a.status}
                      </span>
                      <div className="text-[10px] font-mono text-[#8E9B9A] mt-0.5">{a.currentActiveLeadCount}/{a.maxConcurrentActiveLeads} leads</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {preferences.showRecentLeads && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#B7F45B]" />
              <h3 className="text-base font-bold text-[#F5F7F2]">Open Leads & Countdowns</h3>
            </div>
            <button onClick={() => onDrillDown('leads_today')} className="text-xs font-mono text-[#B7F45B] hover:underline flex items-center gap-1">
              All leads <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#242E30] text-[#8E9B9A] font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Lead</th>
                  <th className="py-2.5 px-3">Owner</th>
                  <th className="py-2.5 px-3">Urgency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Countdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242E30]">
                {openLeads.length === 0 && (
                  <tr><td colSpan={5} className="py-4 px-3 text-[#8E9B9A]">No open leads.</td></tr>
                )}
                {openLeads.slice(0, 8).map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#1F282A]/50">
                    <td className="py-3 px-3 font-medium text-[#F5F7F2] max-w-xs truncate">
                      {lead.title}
                      <div className="text-[10px] text-[#8E9B9A]">{lead.contactName} · {String(lead.source).replace('_', ' ')}</div>
                    </td>
                    <td className="py-3 px-3 text-[#8E9B9A]">{nameOf(lead.currentOwnerId)}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        lead.priority === 'CRITICAL' ? 'bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/30'
                          : lead.priority === 'HIGH' ? 'bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30'
                          : 'bg-[#8E9B9A]/15 text-[#8E9B9A] border-[#8E9B9A]/20'}`}>
                        {lead.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#F5F7F2]">{lead.status}</td>
                    <td className="py-3 px-3"><CountdownTimer deadlineIso={lead.acknowledgementDeadline} isAcknowledged={!!lead.acknowledgedAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={isPrefModalOpen} onClose={() => setIsPrefModalOpen(false)} title="Customize Dashboard" subtitle="Your choice is remembered on this device">
        <div className="space-y-3">
          {[
            { key: 'showKpis', label: 'Key figures' },
            { key: 'showPipelineChart', label: 'Open pipeline by stage' },
            { key: 'showAvailability', label: 'Team availability' },
            { key: 'showRecentLeads', label: 'Open leads & countdowns' },
          ].map((item) => {
            const k = item.key as keyof WidgetPreferences;
            return (
              <label key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-[#0D1112] border border-[#242E30] cursor-pointer hover:border-[#B7F45B]/40">
                <span className="text-sm font-medium text-[#F5F7F2]">{item.label}</span>
                <input type="checkbox" checked={preferences[k]} onChange={(e) => savePreferences({ ...preferences, [k]: e.target.checked })} className="h-4 w-4 accent-[#B7F45B]" />
              </label>
            );
          })}
          <div className="pt-3 border-t border-[#242E30] flex justify-end">
            <button onClick={() => setIsPrefModalOpen(false)} className="px-4 py-2 rounded-lg bg-[#B7F45B] text-[#0D1112] font-semibold text-xs uppercase hover:bg-[#A4E045]">
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
