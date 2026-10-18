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

const card = 'border border-[#E8E1D6] bg-[#FFFFFF] rounded-xl';
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
        opts.alert ? 'bg-[#B9524C]/5 border-[#B9524C]/40 hover:border-[#B9524C]' : 'bg-[#FFFFFF] border-[#E8E1D6] hover:border-[#4F7F6D]/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#78716A] uppercase tracking-wider">{opts.label}</span>
        <div className="p-1.5 rounded-lg bg-[#FAF8F4] text-[#4F7F6D] border border-[#E8E1D6]">{opts.icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold font-mono text-[#2B2A27]">{opts.value}</div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#78716A]">
        <span>{opts.note}</span>
        {opts.onClick && <ArrowRight className="h-3.5 w-3.5 group-hover:text-[#4F7F6D]" />}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E1D6] pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2B2A27]">Operations Dashboard</h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#4F7F6D]/10 border border-[#4F7F6D]/30 text-[#4F7F6D] px-2 py-0.5 rounded">
              {summary ? `${summary.scope === 'company' ? 'COMPANY-WIDE' : 'MY FIGURES'} · LIVE` : 'LOADING'}
            </span>
          </div>
          <p className="text-xs text-[#78716A] mt-0.5">
            Live figures from stored records for <span className="text-[#2B2A27] font-semibold">{workspace.name}</span>
            {summary && <> · updated {new Date(summary.generatedAt).toLocaleTimeString()}</>}
          </p>
          {error && <p className="text-xs text-[#B9524C] mt-1">Could not load figures: {error}</p>}
        </div>
        <button
          onClick={() => setIsPrefModalOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F3EEE6] text-xs font-mono text-[#78716A] hover:text-[#2B2A27] border border-[#E8E1D6] self-start sm:self-auto"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#4F7F6D]" /> Customize Widgets
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
                  {recovery > 0 && <span className="text-xs text-[#B9524C] flex items-center gap-0.5"><Flame className="h-3 w-3" /> NEEDS ACTION</span>}
                </span>
              ),
              note: recovery === null ? 'Visible to managers' : 'Overdue, escalated or idle leads',
              icon: <ShieldAlert className="h-4 w-4 text-[#B9524C]" />,
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
              value: <span className="text-xl text-[#4F7F6D]">{collected === null ? '$•••' : money(collectedCents / 100)}</span>,
              note: collected === null ? 'Requires the value permission' : `${collectedCount} Stripe-confirmed payment(s), refunds deducted`,
              icon: <DollarSign className="h-4 w-4" />,
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#78716A]">Avg First Response</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#2B2A27]">{avgText}</div>
              <div className="text-[10px] text-[#4F7F6D] mt-0.5">First assignment → first acknowledgement · {f?.firstResponseSampleSize ?? 0} leads</div>
            </div>
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#78716A]">Escalations (24h)</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#2B2A27]">{f?.escalationsLast24h ?? '—'}</div>
              <div className="text-[10px] text-[#78716A] mt-0.5">Automatic reassignments after a timeout</div>
            </div>
            <div className={`${card} p-3.5`}>
              <div className="text-[11px] font-mono text-[#78716A]">Available Now</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#2B2A27]">{availableCount} / {totalEmployees}</div>
              <div className="text-[10px] text-[#4F7F6D] mt-0.5">Only Available staff receive leads</div>
            </div>
            <div onClick={() => onDrillDown('appointments')} className={`${card} p-3.5 cursor-pointer hover:border-[#4F7F6D]/40`}>
              <div className="text-[11px] font-mono text-[#78716A]">Upcoming Appointments</div>
              <div className="mt-1 text-lg font-bold font-mono text-[#2B2A27]">{summary ? summary.upcomingAppointmentsNext7Days : '—'}</div>
              <div className="text-[10px] text-[#78716A] mt-0.5">Next 7 days · Google Calendar</div>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {preferences.showPipelineChart && (
          <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#2B2A27]">Open Pipeline by Stage</h3>
                <p className="text-xs text-[#78716A]">Deals not in a won or lost stage</p>
              </div>
              <button onClick={() => onDrillDown('crm_pipeline')} className="text-xs font-mono text-[#4F7F6D] hover:underline flex items-center gap-1">
                Open pipeline <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-3 pt-2">
              {stages === null ? (
                <div className="text-xs text-[#78716A]">Deal values are hidden for your role.</div>
              ) : stages.length === 0 ? (
                <div className="text-xs text-[#78716A]">No open deals yet. Create one in the CRM.</div>
              ) : (
                stages.map((st) => {
                  const max = Math.max(...stages.map((x) => x.total), 1);
                  return (
                    <div key={st.stageId + st.currency} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#2B2A27]">{st.stage}</span>
                        <span className="font-mono text-[#78716A]">{st.opportunities} deals • {money(st.total, st.currency)}</span>
                      </div>
                      <div className="h-2 w-full bg-[#FAF8F4] rounded-full overflow-hidden border border-[#E8E1D6]">
                        <div className="h-full rounded-full bg-[#4F7F6D]" style={{ width: `${Math.max(6, (st.total / max) * 100)}%` }} />
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
                <h3 className="text-base font-bold text-[#2B2A27]">Team Availability</h3>
                <p className="text-xs text-[#78716A]">Status, open leads and alert channel</p>
              </div>
              <UserCheck className="h-4 w-4 text-[#4F7F6D]" />
            </div>
            <div className="space-y-2.5">
              {availabilities.length === 0 && <div className="text-xs text-[#78716A]">No team data yet.</div>}
              {availabilities.map((a) => {
                const colors: Record<string, string> = {
                  AVAILABLE: 'text-[#4F7F6D] border-[#4F7F6D]/30 bg-[#4F7F6D]/10',
                  BUSY: 'text-[#B97F2E] border-[#B97F2E]/30 bg-[#B97F2E]/10',
                  AWAY: 'text-[#78716A] border-[#78716A]/30 bg-[#78716A]/10',
                  OFFLINE: 'text-[#B9524C] border-[#B9524C]/30 bg-[#B9524C]/10',
                };
                return (
                  <div key={a.id} className="p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2B2A27] truncate">{nameOf(a.userId)}</div>
                      <div className="text-[10px] text-[#78716A] truncate">{a.statusReason}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${colors[a.status]}`}>
                        {a.status === 'AWAY' ? 'ON LEAVE' : a.status}
                      </span>
                      <div className="text-[10px] font-mono text-[#78716A] mt-0.5">{a.currentActiveLeadCount}/{a.maxConcurrentActiveLeads} leads</div>
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
              <Clock className="h-4 w-4 text-[#4F7F6D]" />
              <h3 className="text-base font-bold text-[#2B2A27]">Open Leads & Countdowns</h3>
            </div>
            <button onClick={() => onDrillDown('leads_today')} className="text-xs font-mono text-[#4F7F6D] hover:underline flex items-center gap-1">
              All leads <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Lead</th>
                  <th className="py-2.5 px-3">Owner</th>
                  <th className="py-2.5 px-3">Urgency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Countdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D6]">
                {openLeads.length === 0 && (
                  <tr><td colSpan={5} className="py-4 px-3 text-[#78716A]">No open leads.</td></tr>
                )}
                {openLeads.slice(0, 8).map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#F3EEE6]/50">
                    <td className="py-3 px-3 font-medium text-[#2B2A27] max-w-xs truncate">
                      {lead.title}
                      <div className="text-[10px] text-[#78716A]">{lead.contactName} · {String(lead.source).replace('_', ' ')}</div>
                    </td>
                    <td className="py-3 px-3 text-[#78716A]">{nameOf(lead.currentOwnerId)}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        lead.priority === 'CRITICAL' ? 'bg-[#B9524C]/15 text-[#B9524C] border-[#B9524C]/30'
                          : lead.priority === 'HIGH' ? 'bg-[#B97F2E]/15 text-[#B97F2E] border-[#B97F2E]/30'
                          : 'bg-[#78716A]/15 text-[#78716A] border-[#78716A]/20'}`}>
                        {lead.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#2B2A27]">{lead.status}</td>
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
              <label key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] cursor-pointer hover:border-[#4F7F6D]/40">
                <span className="text-sm font-medium text-[#2B2A27]">{item.label}</span>
                <input type="checkbox" checked={preferences[k]} onChange={(e) => savePreferences({ ...preferences, [k]: e.target.checked })} className="h-4 w-4 accent-[#4F7F6D]" />
              </label>
            );
          })}
          <div className="pt-3 border-t border-[#E8E1D6] flex justify-end">
            <button onClick={() => setIsPrefModalOpen(false)} className="px-4 py-2 rounded-lg bg-[#4F7F6D] text-white font-semibold text-xs uppercase hover:bg-[#3F6A5A]">
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
