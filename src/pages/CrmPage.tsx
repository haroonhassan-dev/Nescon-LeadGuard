import React, { useState } from 'react';
import {
  Layers,
  Users,
  Building2,
  Plus,
  ChevronRight,
  Calendar,
  MessageSquare,
  CreditCard,
  Info
} from 'lucide-react';
import { Contact } from '@shared/contact';
import { Company } from '@shared/company';
import { Opportunity } from '@shared/opportunity';
import { Pipeline } from '@shared/pipeline';
import { Message } from '@shared/message';
import { Appointment } from '@shared/appointment';
import { Payment } from '@shared/payment';
import { CustomFieldDefinition } from '../types';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { appStore } from '../services/store';

interface CrmPageProps {
  contacts: Contact[];
  companies: Company[];
  opportunities: Opportunity[];
  pipelines: Pipeline[];
  customFields: CustomFieldDefinition[];
  payments: Payment[];
  messages: Message[];
  appointments: Appointment[];
}

export const CrmPage: React.FC<CrmPageProps> = ({
  contacts,
  companies,
  opportunities,
  pipelines,
  customFields,
  payments,
  messages,
  appointments,
}) => {
  const { user, canViewOpportunityValues } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'pipeline' | 'contacts' | 'companies' | 'custom_fields'>('pipeline');

  // Modals & Drawers
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [isAddCustomFieldModalOpen, setIsAddCustomFieldModalOpen] = useState(false);
  const [selectedContactDetail, setSelectedContactDetail] = useState<Contact | null>(null);

  // New Contact Form State
  const [newContactFirstName, setNewContactFirstName] = useState('');
  const [newContactLastName, setNewContactLastName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');
  const [newContactCompanyId, setNewContactCompanyId] = useState('');

  // New Company Form State
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyDomain, setNewCompanyDomain] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('');
  const [newCompanySize, setNewCompanySize] = useState<Company['size']>('11-50');

  // New Custom Field Form State
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['type']>('text');
  const [newFieldStageRequirement, setNewFieldStageRequirement] = useState('');

  // Stage Movement & Validation
  const handleMoveStage = (opportunityId: string, targetStageId: string) => {
    const res = appStore.moveOpportunityStage(
      opportunityId,
      targetStageId,
      { id: user.id, name: user.fullName }
    );

    if (res.success) {
      showToast('success', 'Stage Advanced', 'Deal progressed to next pipeline milestone.');
    } else {
      showToast('error', 'Stage Progression Blocked', res.error || 'Failed to advance stage.');
    }
  };

  const activePipeline = pipelines[0] || {
    id: 'default',
    stages: [],
  };

  // Contacts Submit
  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    appStore.createContact(
      {
        firstName: newContactFirstName,
        lastName: newContactLastName,
        email: newContactEmail,
        phone: newContactPhone,
        title: newContactTitle,
        companyId: newContactCompanyId || undefined,
      },
      { id: user.id, name: user.fullName }
    );
    showToast('success', 'Contact Created', `${newContactFirstName} ${newContactLastName} added to CRM.`);
    setIsAddContactModalOpen(false);
    setNewContactFirstName('');
    setNewContactLastName('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewContactTitle('');
  };

  // Company Submit
  const handleAddCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    appStore.createCompany(
      {
        name: newCompanyName,
        domain: newCompanyDomain,
        industry: newCompanyIndustry,
        size: newCompanySize,
      },
      { id: user.id, name: user.fullName }
    );
    showToast('success', 'Company Created', `${newCompanyName} provisioned.`);
    setIsAddCompanyModalOpen(false);
    setNewCompanyName('');
    setNewCompanyDomain('');
    setNewCompanyIndustry('');
  };

  // Custom Field Submit
  const handleAddCustomFieldSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    appStore.createCustomField({
      key: newFieldKey.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      label: newFieldLabel,
      type: newFieldType,
      requiredForStageId: newFieldStageRequirement || undefined,
    });
    showToast('success', 'Custom Field Defined', `'${newFieldLabel}' registered.`);
    setIsAddCustomFieldModalOpen(false);
    setNewFieldKey('');
    setNewFieldLabel('');
    setNewFieldStageRequirement('');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242E30] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7F2]">
              CRM & Pipeline Command
            </h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#B7F45B]/10 border border-[#B7F45B]/30 text-[#B7F45B] px-2 py-0.5 rounded">
              ENTERPRISE DIRECTORY
            </span>
          </div>
          <p className="text-xs text-[#8E9B9A] mt-0.5">
            Client contacts, corporate accounts, opportunity stages, and custom required fields
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'contacts' && (
            <button
              onClick={() => setIsAddContactModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Contact
            </button>
          )}

          {activeTab === 'companies' && (
            <button
              onClick={() => setIsAddCompanyModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Company
            </button>
          )}

          {activeTab === 'custom_fields' && (
            <button
              onClick={() => setIsAddCustomFieldModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Custom Field
            </button>
          )}
        </div>
      </div>

      {/* Planned for P1 Roadmap Notice */}
      <div className="p-3.5 rounded-xl bg-[#171E1F] border border-[#56CCF2]/30 flex items-start gap-3">
        <Info className="h-4 w-4 text-[#56CCF2] shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <span className="font-semibold text-[#F5F7F2]">CRM Feature Roadmap Notice (P1 Planned):</span>
          <p className="text-[#8E9B9A]">
            Per backend architecture specifications, CRM endpoints return 501 until the P1 delivery milestone. The pipeline board, contact directories, and stage gates below operate in verified local preview mode.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#242E30] gap-4 text-xs font-mono">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'pipeline'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Pipeline Board ({opportunities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'contacts'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Contacts ({contacts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('companies')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'companies'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Companies ({companies.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('custom_fields')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'custom_fields'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <span>Custom Fields & Stage Rules ({customFields.length})</span>
        </button>
      </div>

      {/* TAB 1: PIPELINE BOARD */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-[#8E9B9A]">
            <span>
              Pipeline: <strong className="text-[#F5F7F2]">{activePipeline.name}</strong>
            </span>
            <span className="font-mono text-[11px]">
              {canViewOpportunityValues ? 'Financial Values Unmasked' : 'Opportunity Values Masked (Agent View)'}
            </span>
          </div>

          {/* Kanban Board Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3.5 items-start">
            {activePipeline.stages.map((stage) => {
              const stageDeals = opportunities.filter((o) => o.stageId === stage.id);
              const stageTotal = stageDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);

              return (
                <div
                  key={stage.id}
                  className="bg-[#171E1F] border border-[#242E30] rounded-xl flex flex-col min-h-[420px]"
                >
                  {/* Column Header */}
                  <div className="p-3 border-b border-[#242E30] bg-[#0D1112] rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#F5F7F2] truncate max-w-[110px]">
                        {stage.name}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#171E1F] border border-[#242E30] text-[#B7F45B]">
                        {stageDeals.length}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-[#8E9B9A]">
                      <span>
                        {canViewOpportunityValues
                          ? `$${stageTotal.toLocaleString()}`
                          : '$•••,•••'}
                      </span>
                      {stage.slaMinutes && (
                        <span>{stage.slaMinutes > 60 ? `${Math.floor(stage.slaMinutes / 60)}h` : `${stage.slaMinutes}m`}</span>
                      )}
                    </div>
                  </div>

                  {/* Deal Cards */}
                  <div className="p-2.5 flex-1 space-y-2.5 overflow-y-auto max-h-[500px]">
                    {stageDeals.length === 0 ? (
                      <div className="text-[11px] font-mono text-[#8E9B9A]/60 text-center py-8">
                        No deals in stage
                      </div>
                    ) : (
                      stageDeals.map((opp) => {
                        const contact = contacts.find((c) => c.id === opp.contactId);
                        const company = companies.find((c) => c.id === opp.companyId);

                        return (
                          <div
                            key={opp.id}
                            className="p-3 rounded-lg bg-[#0D1112] border border-[#242E30] hover:border-[#B7F45B]/50 transition-colors shadow-sm space-y-2"
                          >
                            <div className="text-xs font-semibold text-[#F5F7F2] leading-snug">
                              {opp.title}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-[#B7F45B] font-bold">
                                {canViewOpportunityValues
                                  ? `$${Number(opp.value).toLocaleString()}`
                                  : '$•••,•••'}
                              </span>
                              <span className="text-[#8E9B9A]">{opp.probability}% win</span>
                            </div>

                            {contact && (
                              <div className="text-[10px] text-[#8E9B9A] truncate">
                                {contact.firstName} {contact.lastName}
                              </div>
                            )}

                            {company && (
                              <div className="text-[10px] text-[#8E9B9A] truncate">
                                {company.name}
                              </div>
                            )}

                            {/* Stage advance selector */}
                            <div className="pt-2 border-t border-[#242E30] flex items-center justify-between">
                              <span className="text-[10px] text-[#8E9B9A]">Advance:</span>
                              <select
                                value={opp.stageId}
                                onChange={(e) => handleMoveStage(opp.id, e.target.value)}
                                className="px-1.5 py-0.5 rounded bg-[#171E1F] border border-[#242E30] text-[10px] text-[#F5F7F2] focus:outline-none focus:border-[#B7F45B]"
                              >
                                {activePipeline.stages.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CONTACTS DIRECTORY */}
      {activeTab === 'contacts' && (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0D1112] border-b border-[#242E30] text-[#8E9B9A] font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Title / Role</th>
                  <th className="py-3 px-4">Company Account</th>
                  <th className="py-3 px-4">Direct Contact</th>
                  <th className="py-3 px-4">Preferred Channel</th>
                  <th className="py-3 px-4 text-right">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242E30]">
                {contacts.map((c) => {
                  const company = companies.find((comp) => comp.id === c.companyId);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedContactDetail(c)}
                      className="hover:bg-[#1F282A]/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-semibold text-[#F5F7F2]">
                        {c.firstName} {c.lastName}
                      </td>
                      <td className="py-3 px-4 text-[#8E9B9A]">{c.title || 'Decision Maker'}</td>
                      <td className="py-3 px-4 text-[#F5F7F2]">
                        {company?.name || 'Independent Client'}
                      </td>
                      <td className="py-3 px-4 text-[#8E9B9A] font-mono">
                        <div>{c.email}</div>
                        {c.phone && <div className="text-[10px]">{c.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0D1112] border border-[#242E30] text-[#B7F45B]">
                          {c.preferredChannel || 'SMS'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button className="text-xs font-mono text-[#B7F45B] hover:underline flex items-center gap-1 justify-end">
                          Inspect <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: COMPANIES DIRECTORY */}
      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {companies.map((comp) => {
            const compContacts = contacts.filter((c) => c.companyId === comp.id);
            const compDeals = opportunities.filter((o) => o.companyId === comp.id);

            return (
              <div
                key={comp.id}
                className="p-5 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-3 hover:border-[#B7F45B]/40 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B]">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-mono bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] px-2 py-0.5 rounded">
                    {comp.size} Employees
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-[#F5F7F2]">{comp.name}</h3>
                  <p className="text-xs text-[#8E9B9A]">{comp.industry || 'Commercial Services'}</p>
                </div>

                <div className="pt-2 border-t border-[#242E30] grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[#8E9B9A] block text-[10px]">Contacts:</span>
                    <span className="text-[#F5F7F2] font-semibold">{compContacts.length} Linked</span>
                  </div>
                  <div>
                    <span className="text-[#8E9B9A] block text-[10px]">Active Deals:</span>
                    <span className="text-[#B7F45B] font-semibold">{compDeals.length} Opportunities</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: CUSTOM FIELDS & STAGE VALIDATION RULES */}
      {activeTab === 'custom_fields' && (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Custom Field Definitions & Stage Gates</h3>
              <p className="text-xs text-[#8E9B9A]">
                Configure data schema requirements that prevent premature opportunity stage progression
              </p>
            </div>
            <button
              onClick={() => setIsAddCustomFieldModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase font-mono tracking-wider"
            >
              Add Field Rule
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#0D1112] border-b border-[#242E30] text-[#8E9B9A] font-mono text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Field Label</th>
                  <th className="py-3 px-4">Identifier Key</th>
                  <th className="py-3 px-4">Data Type</th>
                  <th className="py-3 px-4">Required Stage Gate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242E30]">
                {customFields.map((cf) => {
                  const stageName = activePipeline.stages.find((s) => s.id === cf.requiredForStageId)?.name;
                  return (
                    <tr key={cf.id} className="hover:bg-[#1F282A]/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#F5F7F2]">{cf.label}</td>
                      <td className="py-3 px-4 font-mono text-[#8E9B9A]">{cf.key}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0D1112] border border-[#242E30] text-[#56CCF2]">
                          {cf.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {stageName ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/15 text-[#F5A623] border border-[#F5A623]/30">
                            Required before advancing to: {stageName}
                          </span>
                        ) : (
                          <span className="text-[#8E9B9A] font-mono text-[11px]">Optional</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Contact */}
      <Modal
        isOpen={isAddContactModalOpen}
        onClose={() => setIsAddContactModalOpen(false)}
        title="Add New Customer Contact"
        subtitle="Record individual decision maker or facility director"
      >
        <form onSubmit={handleAddContactSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">First Name *</label>
              <input
                type="text"
                required
                value={newContactFirstName}
                onChange={(e) => setNewContactFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={newContactLastName}
                onChange={(e) => setNewContactLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Work Email *</label>
              <input
                type="email"
                required
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Mobile Phone</label>
              <input
                type="text"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Company Account</label>
            <select
              value={newContactCompanyId}
              onChange={(e) => setNewContactCompanyId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            >
              <option value="">Independent / Not Linked</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-[#242E30] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddContactModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#0D1112] text-[#8E9B9A] text-xs border border-[#242E30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase"
            >
              Save Contact
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Company */}
      <Modal
        isOpen={isAddCompanyModalOpen}
        onClose={() => setIsAddCompanyModalOpen(false)}
        title="Add Corporate Client Company"
        subtitle="B2B organization record for enterprise contracts"
      >
        <form onSubmit={handleAddCompanySubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Company Legal Name *</label>
            <input
              type="text"
              required
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Industry</label>
              <input
                type="text"
                placeholder="e.g. Healthcare Facilities"
                value={newCompanyIndustry}
                onChange={(e) => setNewCompanyIndustry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Employee Size</label>
              <select
                value={newCompanySize}
                onChange={(e) => setNewCompanySize(e.target.value as Company['size'])}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              >
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-500">201-500</option>
                <option value="500+">500+</option>
              </select>
            </div>
          </div>

          <div className="border-t border-[#242E30] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddCompanyModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#0D1112] text-[#8E9B9A] text-xs border border-[#242E30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase"
            >
              Save Company
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Custom Field */}
      <Modal
        isOpen={isAddCustomFieldModalOpen}
        onClose={() => setIsAddCustomFieldModalOpen(false)}
        title="Define Custom Field & Stage Requirement"
        subtitle="Enforces business validation rules prior to opportunity stage advancement"
      >
        <form onSubmit={handleAddCustomFieldSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Field Label *</label>
            <input
              type="text"
              required
              placeholder="e.g. Structural Engineering Sign-off Date"
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Database Key *</label>
              <input
                type="text"
                required
                placeholder="e.g. engineering_signoff_date"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">Data Type</label>
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as CustomFieldDefinition['type'])}
                className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              >
                <option value="text">Text String</option>
                <option value="number">Numeric Value</option>
                <option value="date">Date Time</option>
                <option value="dropdown">Dropdown Selector</option>
                <option value="checkbox">Boolean Checkbox</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
              Required Gate For Pipeline Stage:
            </label>
            <select
              value={newFieldStageRequirement}
              onChange={(e) => setNewFieldStageRequirement(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
            >
              <option value="">No Stage Requirement (Optional Field)</option>
              {activePipeline.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  Require before entering: {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-[#242E30] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddCustomFieldModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-[#0D1112] text-[#8E9B9A] text-xs border border-[#242E30]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs uppercase"
            >
              Save Rule
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Contact Detail Inspection (Showing Activity Timeline, Payments, and Appointments) */}
      <Modal
        isOpen={!!selectedContactDetail}
        onClose={() => setSelectedContactDetail(null)}
        title={`${selectedContactDetail?.firstName} ${selectedContactDetail?.lastName}`}
        subtitle={`Title: ${selectedContactDetail?.title || 'Decision Maker'} • Preferred Channel: ${selectedContactDetail?.preferredChannel}`}
        maxWidth="xl"
      >
        {selectedContactDetail && (
          <div className="space-y-4 text-xs">
            {/* Direct Info */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-[#0D1112] rounded-lg border border-[#242E30]">
              <div>
                <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">Email:</span>
                <div className="text-sm font-semibold text-[#F5F7F2]">{selectedContactDetail.email}</div>
                {selectedContactDetail.phone && (
                  <div className="text-[#8E9B9A]">{selectedContactDetail.phone}</div>
                )}
              </div>
              <div>
                <span className="text-[#8E9B9A] font-mono text-[10px] uppercase">Linked Company:</span>
                <div className="text-sm font-semibold text-[#F5F7F2]">
                  {companies.find((c) => c.id === selectedContactDetail.companyId)?.name || 'Independent Client'}
                </div>
              </div>
            </div>

            {/* Linked Appointments */}
            <div className="border border-[#242E30] rounded-lg p-3 space-y-2">
              <span className="text-[#8E9B9A] font-mono text-[10px] uppercase flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#B7F45B]" />
                Scheduled Calendar Consultations:
              </span>
              {appointments.filter((a) => a.contactId === selectedContactDetail.id).length === 0 ? (
                <div className="text-[#8E9B9A] text-[11px]">No upcoming appointments on record.</div>
              ) : (
                appointments
                  .filter((a) => a.contactId === selectedContactDetail.id)
                  .map((apt) => (
                    <div key={apt.id} className="p-2 rounded bg-[#0D1112] flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#F5F7F2]">{apt.title}</span>
                      <span className="text-[#B7F45B]">{new Date(apt.startTime).toLocaleDateString()}</span>
                    </div>
                  ))
              )}
            </div>

            {/* Linked Messages */}
            <div className="border border-[#242E30] rounded-lg p-3 space-y-2">
              <span className="text-[#8E9B9A] font-mono text-[10px] uppercase flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#B7F45B]" />
                Recent Omnichannel Messages:
              </span>
              {messages.filter((m) => m.contactId === selectedContactDetail.id).length === 0 ? (
                <div className="text-[#8E9B9A] text-[11px]">No logged SMS or Telegram conversations.</div>
              ) : (
                messages
                  .filter((m) => m.contactId === selectedContactDetail.id)
                  .map((msg) => (
                    <div key={msg.id} className="p-2 rounded bg-[#0D1112] text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-[#8E9B9A] font-mono text-[10px]">
                        <span>{msg.direction} via {msg.channel}</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[#F5F7F2]">{msg.body}</p>
                    </div>
                  ))
              )}
            </div>

            {/* Linked Stripe Payments */}
            <div className="border border-[#242E30] rounded-lg p-3 space-y-2">
              <span className="text-[#8E9B9A] font-mono text-[10px] uppercase flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-[#B7F45B]" />
                Stripe Test Mode Transactions:
              </span>
              {payments.filter((p) => p.contactId === selectedContactDetail.id).length === 0 ? (
                <div className="text-[#8E9B9A] text-[11px]">No payment history recorded for this contact.</div>
              ) : (
                payments
                  .filter((p) => p.contactId === selectedContactDetail.id)
                  .map((pmt) => (
                    <div key={pmt.id} className="p-2 rounded bg-[#0D1112] text-[11px] flex items-center justify-between font-mono">
                      <div>
                        <div className="text-[#F5F7F2] font-semibold">
                          ${(pmt.amount / 100).toFixed(2)} {pmt.currency.toUpperCase()}
                        </div>
                        <div className="text-[#8E9B9A] text-[10px]">{pmt.description || pmt.stripePaymentIntentId}</div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                          pmt.status === 'SUCCEEDED'
                            ? 'bg-[#B7F45B]/15 text-[#B7F45B] border border-[#B7F45B]/30'
                            : 'bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/30'
                        }`}>
                          {pmt.status}
                        </span>
                        <div className="text-[#8E9B9A] text-[10px] mt-0.5">{new Date(pmt.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedContactDetail(null)}
                className="px-4 py-2 rounded-lg bg-[#0D1112] text-[#8E9B9A] hover:text-[#F5F7F2] border border-[#242E30]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
