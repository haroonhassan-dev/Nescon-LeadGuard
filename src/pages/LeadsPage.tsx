import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ShieldAlert,
  Flame,
  CheckCircle2,
  UserX,
  Building2
} from 'lucide-react';
import { Lead, LeadSource, LeadPriority } from '@shared/lead';
import { EmployeeAvailability } from '@shared/availability';
import { User } from '@shared/user';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { backendService } from '../services/backendService';
import { requestSync, errorMessage } from '../services/sync';

interface LeadsPageProps {
  leads: Lead[];
  users: User[];
  availabilities: EmployeeAvailability[];
  initialFilter?: 'all' | 'overdue' | 'today' | 'unassigned';
}

export const LeadsPage: React.FC<LeadsPageProps> = ({
  leads,
  users,
  availabilities,
  initialFilter = 'all',
}) => {
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>(
    initialFilter === 'overdue' ? 'ESCALATED' : initialFilter === 'unassigned' ? 'UNASSIGNED' : 'ALL'
  );
  const [selectedOwner, setSelectedOwner] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'all' | 'recovery'>('all');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reassignLeadTarget, setReassignLeadTarget] = useState<Lead | null>(null);
  const [selectedLeadDetail, setSelectedLeadDetail] = useState<Lead | null>(null);

  // New Lead Form State
  const [newTitle, setNewTitle] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newSource, setNewSource] = useState<LeadSource>('WEBSITE_FORM');
  const [newPriority, setNewPriority] = useState<LeadPriority>('HIGH');
  const [newValue, setNewValue] = useState(25000);
  const [newNotes, setNewNotes] = useState('');

  // Reassignment Form State
  const [reassignOwnerId, setReassignOwnerId] = useState('');
  const [reassignReason, setReassignReason] = useState('SLA Recovery Reassignment');

  // Permissions
  const canClaim = hasPermission('lead:claim');
  const canAcknowledge = hasPermission('lead:acknowledge');
  const canReassign = hasPermission('lead:reassign');
  const canCreate = hasPermission('lead:create');

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (activeTab === 'recovery') {
        const isBreached =
          lead.status === 'ESCALATED' ||
          (!lead.acknowledgedAt &&
            lead.acknowledgementDeadline &&
            new Date(lead.acknowledgementDeadline).getTime() < Date.now());
        if (!isBreached) return false;
      }

      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matches =
          lead.title.toLowerCase().includes(query) ||
          lead.contactName.toLowerCase().includes(query) ||
          lead.contactEmail.toLowerCase().includes(query) ||
          (lead.companyName && lead.companyName.toLowerCase().includes(query));
        if (!matches) return false;
      }

      if (selectedSource !== 'ALL' && lead.source !== selectedSource) return false;
      if (selectedPriority !== 'ALL' && lead.priority !== selectedPriority) return false;
      if (selectedStatus !== 'ALL' && lead.status !== selectedStatus) return false;
      if (selectedOwner !== 'ALL') {
        if (selectedOwner === 'UNASSIGNED' && lead.currentOwnerId) return false;
        if (selectedOwner !== 'UNASSIGNED' && lead.currentOwnerId !== selectedOwner) return false;
      }

      return true;
    });
  }, [leads, activeTab, searchTerm, selectedSource, selectedPriority, selectedStatus, selectedOwner]);

  // Actions
  const handleClaim = async (lead: Lead) => {
    if (!canClaim) {
      showToast('error', 'Permission Denied', 'Your role lacks [lead:claim] permissions.');
      return;
    }
    try {
      await backendService.claimLead(lead.id);
      showToast('success', 'Lead Claimed', `You are now the single owner of "${lead.title}".`);
      requestSync();
    } catch (err) {
      showToast('error', 'Could not claim', errorMessage(err));
    }
  };

  const handleAcknowledge = async (lead: Lead) => {
    if (!canAcknowledge) {
      showToast('error', 'Permission Denied', 'Your role lacks [lead:acknowledge] permissions.');
      return;
    }
    try {
      await backendService.acknowledgeLead(lead.id);
      showToast('success', 'Acknowledged', 'Escalation timer stopped.');
      requestSync();
    } catch (err) {
      showToast('error', 'Could not acknowledge', errorMessage(err));
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignLeadTarget || !reassignOwnerId) return;

    try {
      await backendService.reassignLead(reassignLeadTarget.id, reassignOwnerId, reassignReason);
      const targetUser = users.find((u) => u.id === reassignOwnerId);
      showToast('success', 'Lead Reassigned', `Transferred to ${targetUser?.firstName || 'employee'}. New acknowledgement window started.`);
      setReassignLeadTarget(null);
      requestSync();
    } catch (err) {
      showToast('error', 'Reassign refused', errorMessage(err));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let created;
    try {
      created = await backendService.createLead({
        contactName: newContactName,
        contactEmail: newContactEmail || undefined,
        contactPhone: newContactPhone || undefined,
        message: newNotes || undefined,
        title: newTitle || undefined,
      });
    } catch (err) {
      showToast('error', 'Lead not created', errorMessage(err));
      return;
    }
    showToast(
      'success',
      'Lead created',
      created.currentOwnerId ? 'Assigned by round-robin; the countdown is running.' : 'No one is Available, so it waits in the recovery queue.'
    );
    requestSync();

    setIsCreateModalOpen(false);
    // Reset form
    setNewTitle('');
    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewCompanyName('');
    setNewNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242E30] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7F2]">
              Lead Command Center
            </h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#B7F45B]/10 border border-[#B7F45B]/30 text-[#B7F45B] px-2 py-0.5 rounded">
              SINGLE-OWNER ENFORCED
            </span>
          </div>
          <p className="text-xs text-[#8E9B9A] mt-0.5">
            Real-time SLA deadline monitoring, automated routing, and crash-resilient escalation queue
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!canCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] disabled:opacity-50 text-[#0D1112] font-semibold text-xs tracking-wide uppercase transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ingest New Lead
          </button>
        </div>
      </div>

      {/* Tabs: Inbox vs Recovery Queue */}
      <div className="flex border-b border-[#242E30] gap-4 text-xs font-mono">
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'all'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <span>All Active Leads</span>
          <span className="px-1.5 py-0.2 rounded bg-[#171E1F] border border-[#242E30] text-[#F5F7F2]">
            {leads.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('recovery')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'recovery'
              ? 'border-[#FF5C5C] text-[#FF5C5C]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Flame className="h-3.5 w-3.5 text-[#FF5C5C]" />
          <span>SLA Recovery Queue</span>
          <span className="px-1.5 py-0.2 rounded bg-[#FF5C5C]/20 border border-[#FF5C5C]/40 text-[#FF5C5C] font-bold">
            {
              leads.filter(
                (l) =>
                  l.status === 'ESCALATED' ||
                  (!l.acknowledgedAt &&
                    l.acknowledgementDeadline &&
                    new Date(l.acknowledgementDeadline).getTime() < Date.now())
              ).length
            }
          </span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search Input */}
        <div className="relative lg:col-span-2">
          <input
            type="text"
            placeholder="Search leads, customer name, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-[#171E1F] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8E9B9A]" />
        </div>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#171E1F] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
        >
          <option value="ALL">All Priorities</option>
          <option value="CRITICAL">Critical Priority</option>
          <option value="HIGH">High Priority</option>
          <option value="MEDIUM">Medium Priority</option>
          <option value="LOW">Low Priority</option>
        </select>

        {/* Source Filter */}
        <select
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#171E1F] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
        >
          <option value="ALL">All Ingress Sources</option>
          <option value="TWILIO_SMS">Twilio SMS</option>
          <option value="TELEGRAM_BOT">Telegram Bot</option>
          <option value="STRIPE_CHECKOUT">Stripe Checkout</option>
          <option value="WEBSITE_FORM">Website Form</option>
          <option value="INBOUND_CALL">Inbound Call</option>
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#171E1F] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
        >
          <option value="ALL">All Statuses</option>
          <option value="UNASSIGNED">Unassigned</option>
          <option value="ASSIGNED">Assigned (Counting Down)</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="ESCALATED">Escalated</option>
          <option value="IN_PROGRESS">In Progress</option>
        </select>

        {/* Owner Filter */}
        <select
          value={selectedOwner}
          onChange={(e) => setSelectedOwner(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#171E1F] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
        >
          <option value="ALL">All Owners</option>
          <option value="UNASSIGNED">Unassigned Only</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>

      {/* Leads Table */}
      {filteredLeads.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No Leads Found"
          description="Try adjusting your filters or ingest a new commercial lead into the routing queue."
          actionLabel="Create Test Lead"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0D1112] border-b border-[#242E30] text-[#8E9B9A] font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Lead Details & Source</th>
                  <th className="py-3 px-4">Contact / Account</th>
                  <th className="py-3 px-4">Priority & Value</th>
                  <th className="py-3 px-4">Assigned Owner</th>
                  <th className="py-3 px-4">SLA Countdown</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242E30]">
                {filteredLeads.map((lead) => {
                  const owner = users.find((u) => u.id === lead.currentOwnerId);
                  const isOverdue =
                    !lead.acknowledgedAt &&
                    lead.acknowledgementDeadline &&
                    new Date(lead.acknowledgementDeadline).getTime() < Date.now();

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-[#1F282A]/60 transition-colors ${
                        isOverdue ? 'bg-[#FF5C5C]/5' : ''
                      }`}
                    >
                      {/* Title & Source */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <div
                          onClick={() => setSelectedLeadDetail(lead)}
                          className="font-semibold text-sm text-[#F5F7F2] hover:text-[#B7F45B] cursor-pointer truncate"
                        >
                          {lead.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#0D1112] border border-[#242E30] text-[#8E9B9A]">
                            {lead.source}
                          </span>
                          {lead.status === 'ESCALATED' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#FF5C5C]/20 text-[#FF5C5C] border border-[#FF5C5C]/40 font-bold">
                              LEVEL {lead.escalationLevel} ESCALATED
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Contact / Org */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#F5F7F2]">{lead.contactName}</div>
                        <div className="text-[11px] text-[#8E9B9A] flex items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[140px]">{lead.companyName || 'Independent'}</span>
                        </div>
                      </td>

                      {/* Priority & Value */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                            lead.priority === 'CRITICAL'
                              ? 'bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/30'
                              : lead.priority === 'HIGH'
                              ? 'bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/30'
                              : 'bg-[#8E9B9A]/15 text-[#8E9B9A] border border-[#8E9B9A]/20'
                          }`}
                        >
                          {lead.priority}
                        </span>
                        <div className="font-mono text-xs text-[#F5F7F2] mt-1 font-semibold">
                          ${(lead.estimatedValue || 0).toLocaleString()}
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4">
                        {owner ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={owner.avatarUrl}
                              alt={owner.firstName}
                              className="h-6 w-6 rounded-full object-cover border border-[#242E30]"
                            />
                            <div>
                              <div className="font-medium text-[#F5F7F2] text-xs">
                                {owner.firstName} {owner.lastName}
                              </div>
                              <div className="text-[10px] font-mono text-[#8E9B9A]">
                                {owner.role?.type}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#F5A623]">
                            <UserX className="h-3.5 w-3.5" />
                            UNASSIGNED
                          </span>
                        )}
                      </td>

                      {/* SLA Countdown */}
                      <td className="py-3.5 px-4">
                        <CountdownTimer
                          deadlineIso={lead.acknowledgementDeadline}
                          isAcknowledged={!!lead.acknowledgedAt}
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Claim button (if unassigned) */}
                          {!lead.currentOwnerId && (
                            <button
                              onClick={() => handleClaim(lead)}
                              className="px-2.5 py-1 rounded bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-[11px] font-mono uppercase tracking-wider"
                              title="Claim single ownership"
                            >
                              Claim
                            </button>
                          )}

                          {/* Acknowledge button (if assigned and not yet acknowledged) */}
                          {lead.currentOwnerId === user.id && !lead.acknowledgedAt && (
                            <button
                              onClick={() => handleAcknowledge(lead)}
                              className="px-2.5 py-1 rounded bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-[11px] font-mono uppercase tracking-wider"
                              title="Acknowledge lead to stop SLA escalation"
                            >
                              Acknowledge
                            </button>
                          )}

                          {/* Reassign button */}
                          {canReassign && (
                            <button
                              onClick={() => {
                                setReassignLeadTarget(lead);
                                setReassignOwnerId(lead.currentOwnerId || '');
                              }}
                              className="px-2.5 py-1 rounded bg-[#0D1112] hover:bg-[#1F282A] text-[#8E9B9A] hover:text-[#F5F7F2] border border-[#242E30] text-[11px] font-mono transition-colors"
                              title="Transfer or Reassign to on-call agent"
                            >
                              Reassign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Inbound Lead */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Ingest New Service Lead"
        subtitle="Enters lead into the autonomous routing queue with SLA countdown"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
              Service Request Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Critical Chiller Leak at Terminal 4"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Contact Person Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Liam Gallagher"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Company / Facility
              </label>
              <input
                type="text"
                placeholder="e.g. Logan Airport Facilities"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="liam@airportops.com"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Phone Number (E.164)
              </label>
              <input
                type="text"
                placeholder="+15552345678"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Source</label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value as LeadSource)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              >
                <option value="WEBSITE_FORM">Website Form</option>
                <option value="TWILIO_SMS">Twilio SMS</option>
                <option value="TELEGRAM_BOT">Telegram Bot</option>
                <option value="STRIPE_CHECKOUT">Stripe Checkout</option>
                <option value="INBOUND_CALL">Inbound Call</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as LeadPriority)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Estimated Value ($)
              </label>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
              Dispatch Notes / Technical Scope
            </label>
            <textarea
              rows={2}
              placeholder="Immediate dispatch requested. Technician must possess OSHA certification."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            />
          </div>

          <div className="border-t border-[#242E30] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#0D1112] hover:bg-[#1F282A] text-[#8E9B9A] text-xs border border-[#242E30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ingest & Start SLA
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reassign Lead */}
      <Modal
        isOpen={!!reassignLeadTarget}
        onClose={() => setReassignLeadTarget(null)}
        title="Reassign Lead Ownership"
        subtitle={`Select available on-call employee for "${reassignLeadTarget?.title}"`}
      >
        <form onSubmit={handleReassignSubmit} className="space-y-4">
          <div className="p-3 rounded-lg bg-[#0D1112] border border-[#242E30] space-y-1 text-xs">
            <div className="text-[#8E9B9A]">Current Owner:</div>
            <div className="font-semibold text-[#F5F7F2]">
              {(() => {
                const cur = users.find((u) => u.id === reassignLeadTarget?.currentOwnerId);
                return cur ? `${cur.firstName} ${cur.lastName}` : 'Unassigned';
              })()}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
              New Assigned Employee *
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {availabilities.map((avail) => {
                const emp = users.find((u) => u.id === avail.userId);
                if (!emp) return null;
                const isSelected = reassignOwnerId === emp.id;

                return (
                  <div
                    key={avail.id}
                    onClick={() => setReassignOwnerId(emp.id)}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[#B7F45B]/10 border-[#B7F45B] text-[#F5F7F2]'
                        : 'bg-[#0D1112] border-[#242E30] text-[#8E9B9A] hover:border-[#B7F45B]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={emp.avatarUrl} alt={emp.firstName} className="h-6 w-6 rounded-full object-cover" />
                      <div>
                        <div className="text-xs font-bold text-[#F5F7F2]">{emp.firstName} {emp.lastName}</div>
                        <div className="text-[10px] font-mono text-[#8E9B9A]">
                          {avail.status} &bull; Capacity: {avail.currentActiveLeadCount}/{avail.maxConcurrentActiveLeads} leads
                        </div>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-[#B7F45B]" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
              Reassignment Reason
            </label>
            <input
              type="text"
              required
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            />
          </div>

          <div className="border-t border-[#242E30] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setReassignLeadTarget(null)}
              className="px-4 py-2 rounded-lg bg-[#0D1112] hover:bg-[#1F282A] text-[#8E9B9A] text-xs border border-[#242E30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reassignOwnerId}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] disabled:opacity-50 text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              Transfer Lead
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Lead Detail Inspection */}
      <Modal
        isOpen={!!selectedLeadDetail}
        onClose={() => setSelectedLeadDetail(null)}
        title={selectedLeadDetail?.title || 'Lead Detail'}
        subtitle={`ID: ${selectedLeadDetail?.id} • Ingress: ${selectedLeadDetail?.source}`}
        maxWidth="xl"
      >
        {selectedLeadDetail && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-[#0D1112] rounded-lg border border-[#242E30]">
              <div>
                <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">Contact:</span>
                <div className="text-sm font-semibold text-[#F5F7F2]">{selectedLeadDetail.contactName}</div>
                <div className="text-[#8E9B9A]">{selectedLeadDetail.contactEmail}</div>
                {selectedLeadDetail.contactPhone && (
                  <div className="text-[#8E9B9A]">{selectedLeadDetail.contactPhone}</div>
                )}
              </div>
              <div>
                <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">Company Account:</span>
                <div className="text-sm font-semibold text-[#F5F7F2]">
                  {selectedLeadDetail.companyName || 'Independent Client'}
                </div>
                <div className="text-[#B7F45B] font-mono mt-1 font-bold">
                  Estimated Value: ${(selectedLeadDetail.estimatedValue || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="border border-[#242E30] rounded-lg p-3 space-y-2">
              <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">SLA & Timing:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                <div>
                  <span className="text-[#8E9B9A]">Created:</span>
                  <div className="text-[#F5F7F2]">{new Date(selectedLeadDetail.createdAt).toLocaleTimeString()}</div>
                </div>
                <div>
                  <span className="text-[#8E9B9A]">SLA Deadline:</span>
                  <div className="text-[#F5F7F2]">
                    {selectedLeadDetail.acknowledgementDeadline
                      ? new Date(selectedLeadDetail.acknowledgementDeadline).toLocaleTimeString()
                      : 'None'}
                  </div>
                </div>
                <div>
                  <span className="text-[#8E9B9A]">Status:</span>
                  <div className="text-[#B7F45B] font-bold">{selectedLeadDetail.status}</div>
                </div>
              </div>
            </div>

            {selectedLeadDetail.notes && (
              <div className="p-3 bg-[#0D1112] rounded-lg border border-[#242E30]">
                <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">Scope Notes & History:</span>
                <p className="text-xs text-[#F5F7F2] mt-1 whitespace-pre-wrap">{selectedLeadDetail.notes}</p>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setSelectedLeadDetail(null)}
                className="px-4 py-2 rounded-lg bg-[#0D1112] text-[#8E9B9A] hover:text-[#F5F7F2] border border-[#242E30]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
