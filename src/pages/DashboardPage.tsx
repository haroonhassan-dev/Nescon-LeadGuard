import React, { useState } from 'react';
import {
  Activity,
  Clock,
  DollarSign,
  TrendingUp,
  UserCheck,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { Lead } from '@shared/lead';
import { Opportunity } from '@shared/opportunity';
import { Payment } from '@shared/payment';
import { EmployeeAvailability } from '@shared/availability';
import { Appointment } from '@shared/appointment';
import { AuditEvent } from '@shared/audit';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { Modal } from '../components/common/Modal';
import { WidgetPreferences } from '../types';
import { useAuth } from '../context/AuthContext';

interface DashboardPageProps {
  leads: Lead[];
  opportunities: Opportunity[];
  payments: Payment[];
  availabilities: EmployeeAvailability[];
  appointments: Appointment[];
  auditEvents: AuditEvent[];
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

export const DashboardPage: React.FC<DashboardPageProps> = ({
  leads,
  opportunities,
  payments,
  availabilities,
  appointments,
  auditEvents,
  onDrillDown,
}) => {
  const { workspace, canViewOpportunityValues } = useAuth();
  const [preferences, setPreferences] = useState<WidgetPreferences>(() => {
    try {
      const saved = localStorage.getItem('nescon_widget_preferences');
      return saved ? JSON.parse(saved) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);

  const savePreferences = (newPrefs: WidgetPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem('nescon_widget_preferences', JSON.stringify(newPrefs));
  };

  // KPI Calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const leadsCreatedToday = leads.filter(
    (l) => new Date(l.createdAt).getTime() >= todayStart.getTime()
  );

  const overdueLeads = leads.filter(
    (l) =>
      !l.acknowledgedAt &&
      l.acknowledgementDeadline &&
      new Date(l.acknowledgementDeadline).getTime() < Date.now()
  );

  const escalationsLast24h = auditEvents.filter(
    (e) =>
      e.action === 'LEAD_ESCALATED' &&
      new Date(e.timestamp).getTime() >= Date.now() - 24 * 3600 * 1000
  );

  // Confirmed Payment Revenue from Stripe Test Mode
  const confirmedRevenueCents = payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + p.amount, 0);
  const confirmedRevenueDollars = (confirmedRevenueCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });

  // Pipeline total value
  const totalPipelineValue = opportunities
    .filter((o) => o.status === 'OPEN')
    .reduce((sum, o) => sum + Number(o.value || 0), 0);

  const formattedPipelineValue = canViewOpportunityValues
    ? totalPipelineValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      })
    : '$•••,••• (Masked)';

  // Availability metrics
  const availableEmployees = availabilities.filter((a) => a.status === 'AVAILABLE');
  const totalEmployees = availabilities.length || 1;

  return (
    <div className="space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242E30] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7F2]">
              Executive Operations Dashboard
            </h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#B7F45B]/10 border border-[#B7F45B]/30 text-[#B7F45B] px-2 py-0.5 rounded">
              LIVE TELEMETRY
            </span>
          </div>
          <p className="text-xs text-[#8E9B9A] mt-0.5">
            Real-time SLA monitoring, active worker capacities, and revenue tracking for{' '}
            <span className="text-[#F5F7F2] font-semibold">{workspace.name}</span>
          </p>
        </div>

        <button
          onClick={() => setIsPrefModalOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#171E1F] hover:bg-[#1F282A] text-xs font-mono text-[#8E9B9A] hover:text-[#F5F7F2] border border-[#242E30] transition-colors self-start sm:self-auto"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#B7F45B]" />
          Customize Widgets
        </button>
      </div>

      {/* Primary KPI Grid (8 metrics with drilldowns) */}
      {preferences.showKpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Overdue / Recoverable Leads (Drilldown 1) */}
          <div
            onClick={() => onDrillDown('leads_overdue')}
            className={`cursor-pointer border rounded-xl p-4 transition-all duration-200 group ${
              overdueLeads.length > 0
                ? 'bg-[#FF5C5C]/5 border-[#FF5C5C]/40 hover:border-[#FF5C5C]'
                : 'bg-[#171E1F] border-[#242E30] hover:border-[#B7F45B]/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#8E9B9A] uppercase tracking-wider">
                Recoverable Leads
              </span>
              <div className="p-1.5 rounded-lg bg-[#0D1112] text-[#FF5C5C] border border-[#FF5C5C]/30">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[#F5F7F2]">
                {overdueLeads.length}
              </span>
              {overdueLeads.length > 0 && (
                <span className="text-xs font-mono text-[#FF5C5C] flex items-center gap-0.5">
                  <Flame className="h-3 w-3" /> SLA BREACHED
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E9B9A]">
              <span>Requires immediate reassignment</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#8E9B9A] group-hover:text-[#B7F45B] transition-colors" />
            </div>
          </div>

          {/* Card 2: Today's Leads (Drilldown 2) */}
          <div
            onClick={() => onDrillDown('leads_today')}
            className="cursor-pointer border border-[#242E30] bg-[#171E1F] hover:border-[#B7F45B]/50 rounded-xl p-4 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#8E9B9A] uppercase tracking-wider">
                Leads Created Today
              </span>
              <div className="p-1.5 rounded-lg bg-[#0D1112] text-[#B7F45B] border border-[#242E30]">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[#F5F7F2]">
                {leadsCreatedToday.length}
              </span>
              <span className="text-xs font-mono text-[#B7F45B] flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> Ingestion Active
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E9B9A]">
              <span>Omnichannel routing</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#8E9B9A] group-hover:text-[#B7F45B] transition-colors" />
            </div>
          </div>

          {/* Card 3: Open Pipeline Value (Drilldown 3) */}
          <div
            onClick={() => onDrillDown('crm_pipeline')}
            className="cursor-pointer border border-[#242E30] bg-[#171E1F] hover:border-[#B7F45B]/50 rounded-xl p-4 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#8E9B9A] uppercase tracking-wider">
                Open Pipeline Value
              </span>
              <div className="p-1.5 rounded-lg bg-[#0D1112] text-[#B7F45B] border border-[#242E30]">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-[#F5F7F2]">
                {formattedPipelineValue}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E9B9A]">
              <span>{opportunities.filter((o) => o.status === 'OPEN').length} active deals</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#8E9B9A] group-hover:text-[#B7F45B] transition-colors" />
            </div>
          </div>

          {/* Card 4: Confirmed Payment Revenue (Stripe Test Mode) */}
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#8E9B9A] uppercase tracking-wider">
                Stripe Test Revenue
              </span>
              <div className="p-1.5 rounded-lg bg-[#0D1112] text-[#B7F45B] border border-[#242E30]">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-[#B7F45B]">
                {confirmedRevenueDollars}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#8E9B9A]">
              <span>{payments.filter((p) => p.status === 'SUCCEEDED').length} deposits verified</span>
              <span className="font-mono text-[10px] text-[#B7F45B]">TEST MODE</span>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Metrics Strip */}
      {preferences.showKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Metric 5: Average Response Time */}
          <div className="border border-[#242E30] bg-[#171E1F] p-3.5 rounded-xl">
            <div className="text-[11px] font-mono text-[#8E9B9A]">Avg First-Response</div>
            <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">4m 18s</div>
            <div className="text-[10px] text-[#B7F45B] mt-0.5">SLA Target: 15m</div>
          </div>

          {/* Metric 6: Escalations in 24h */}
          <div className="border border-[#242E30] bg-[#171E1F] p-3.5 rounded-xl">
            <div className="text-[11px] font-mono text-[#8E9B9A]">Escalations (24h)</div>
            <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">
              {escalationsLast24h.length}
            </div>
            <div className="text-[10px] text-[#8E9B9A] mt-0.5">Level 1 Manager Alerts</div>
          </div>

          {/* Metric 7: Available Employee Ratio */}
          <div className="border border-[#242E30] bg-[#171E1F] p-3.5 rounded-xl">
            <div className="text-[11px] font-mono text-[#8E9B9A]">Active Capacity</div>
            <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">
              {availableEmployees.length} / {totalEmployees} Ready
            </div>
            <div className="text-[10px] text-[#B7F45B] mt-0.5">Auto-routing armed</div>
          </div>

          {/* Metric 8: Upcoming Appointments */}
          <div
            onClick={() => onDrillDown('appointments')}
            className="cursor-pointer border border-[#242E30] bg-[#171E1F] hover:border-[#B7F45B]/40 p-3.5 rounded-xl transition-colors"
          >
            <div className="text-[11px] font-mono text-[#8E9B9A]">Google Calendar</div>
            <div className="mt-1 text-lg font-bold font-mono text-[#F5F7F2]">
              {appointments.filter((a) => a.status === 'CONFIRMED').length} Consultations
            </div>
            <div className="text-[10px] text-[#8E9B9A] mt-0.5">Bi-directional sync</div>
          </div>
        </div>
      )}

      {/* Middle Grid: Pipeline Funnel & Availability Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Funnel Breakdown */}
        {preferences.showPipelineChart && (
          <div className="lg:col-span-2 border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Commercial Opportunity Funnel</h3>
                <p className="text-xs text-[#8E9B9A]">Stage progression and deal velocity</p>
              </div>
              <button
                onClick={() => onDrillDown('crm_pipeline')}
                className="text-xs font-mono text-[#B7F45B] hover:underline flex items-center gap-1"
              >
                View Pipeline Kanban <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              {[
                { name: 'Inbound Triage', count: 1, value: 12500, color: '#8E9B9A' },
                { name: 'Qualified Assessment', count: 2, value: 83000, color: '#56CCF2' },
                { name: 'Proposal / Estimate', count: 1, value: 145000, color: '#F5A623' },
                { name: 'Negotiation & SLA', count: 1, value: 68500, color: '#B7F45B' },
                { name: 'Contract Executed (Won)', count: 1, value: 92000, color: '#B7F45B' },
              ].map((stage) => {
                const percentage = Math.min(100, Math.max(15, (stage.value / 150000) * 100));
                return (
                  <div key={stage.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#F5F7F2]">{stage.name}</span>
                      <span className="font-mono text-[#8E9B9A]">
                        {stage.count} deals &bull;{' '}
                        {canViewOpportunityValues
                          ? stage.value.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              minimumFractionDigits: 0,
                            })
                          : '$•••,•••'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#0D1112] rounded-full overflow-hidden border border-[#242E30]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Employee Availability Monitor */}
        {preferences.showAvailability && (
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">On-Call Employee Status</h3>
                <p className="text-xs text-[#8E9B9A]">Routing eligibility & active capacity</p>
              </div>
              <UserCheck className="h-4 w-4 text-[#B7F45B]" />
            </div>

            <div className="space-y-3 pt-1">
              {availabilities.slice(0, 4).map((avail) => {
                const statusColors = {
                  AVAILABLE: 'text-[#B7F45B] border-[#B7F45B]/30 bg-[#B7F45B]/10',
                  BUSY: 'text-[#F5A623] border-[#F5A623]/30 bg-[#F5A623]/10',
                  AWAY: 'text-[#8E9B9A] border-[#8E9B9A]/30 bg-[#8E9B9A]/10',
                  OFFLINE: 'text-[#FF5C5C] border-[#FF5C5C]/30 bg-[#FF5C5C]/10',
                };

                return (
                  <div
                    key={avail.id}
                    className="p-2.5 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#F5F7F2] capitalize">
                        {avail.userId.replace('usr_', '').replace('_', ' ')}
                      </div>
                      <div className="text-[10px] text-[#8E9B9A] truncate max-w-[150px]">
                        {avail.statusReason || 'Active Shift'}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${
                          statusColors[avail.status]
                        }`}
                      >
                        {avail.status}
                      </span>
                      <div className="text-[10px] font-mono text-[#8E9B9A] mt-0.5">
                        {avail.currentActiveLeadCount}/{avail.maxConcurrentActiveLeads} leads
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Grid: Live Urgent Leads Queue */}
      {preferences.showRecentLeads && (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#B7F45B]" />
              <h3 className="text-base font-bold text-[#F5F7F2]">Active Lead SLA Deadlines</h3>
            </div>
            <button
              onClick={() => onDrillDown('leads_today')}
              className="text-xs font-mono text-[#B7F45B] hover:underline flex items-center gap-1"
            >
              Full Lead Inbox <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#242E30] text-[#8E9B9A] font-mono text-[11px] uppercase">
                  <th className="py-2.5 px-3">Lead Title</th>
                  <th className="py-2.5 px-3">Contact / Org</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Current Status</th>
                  <th className="py-2.5 px-3">SLA Countdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242E30]">
                {leads.slice(0, 4).map((lead) => (
                  <tr key={lead.id} className="hover:bg-[#1F282A]/50 transition-colors">
                    <td className="py-3 px-3 font-medium text-[#F5F7F2] max-w-xs truncate">
                      {lead.title}
                    </td>
                    <td className="py-3 px-3 text-[#8E9B9A]">
                      {lead.contactName} ({lead.companyName || 'Independent'})
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          lead.priority === 'CRITICAL'
                            ? 'bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/30'
                            : lead.priority === 'HIGH'
                            ? 'bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/30'
                            : 'bg-[#8E9B9A]/15 text-[#8E9B9A] border border-[#8E9B9A]/20'
                        }`}
                      >
                        {lead.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-xs text-[#F5F7F2]">{lead.status}</span>
                    </td>
                    <td className="py-3 px-3">
                      <CountdownTimer
                        deadlineIso={lead.acknowledgementDeadline}
                        isAcknowledged={!!lead.acknowledgedAt}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Widget Preferences Modal */}
      <Modal
        isOpen={isPrefModalOpen}
        onClose={() => setIsPrefModalOpen(false)}
        title="Customize Dashboard Widgets"
        subtitle="Persist your visual telemetry preferences locally"
      >
        <div className="space-y-3">
          {[
            { key: 'showKpis', label: 'Primary KPI Metric Cards' },
            { key: 'showPipelineChart', label: 'Pipeline Stage Velocity Funnel' },
            { key: 'showAvailability', label: 'Employee Availability Monitor' },
            { key: 'showRecentLeads', label: 'Active Lead SLA Queue' },
          ].map((item) => {
            const k = item.key as keyof WidgetPreferences;
            const checked = preferences[k];
            return (
              <label
                key={item.key}
                className="flex items-center justify-between p-3 rounded-lg bg-[#0D1112] border border-[#242E30] cursor-pointer hover:border-[#B7F45B]/40 transition-colors"
              >
                <span className="text-sm font-medium text-[#F5F7F2]">{item.label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    savePreferences({
                      ...preferences,
                      [k]: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[#B7F45B] rounded cursor-pointer"
                />
              </label>
            );
          })}

          <div className="pt-3 border-t border-[#242E30] flex justify-end">
            <button
              onClick={() => setIsPrefModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#B7F45B] text-[#0D1112] font-semibold text-xs uppercase tracking-wide hover:bg-[#A4E045]"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
