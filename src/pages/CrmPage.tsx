import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Users, Building2, Plus, ChevronRight, ChevronUp, ChevronDown, Trash2, ListFilter, Settings2, CreditCard, Calendar, Copy } from 'lucide-react';
import { User } from '@shared/user';
import { Modal } from '../components/common/Modal';
import { FieldInput, inputCls } from '../components/common/FieldInput';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  liveApi,
  ApiPipeline,
  ApiOpportunity,
  ApiOpportunityDetail,
  ApiContact,
  ApiCompany,
  ApiSavedList,
  ApiField,
  FieldValues,
  FieldType,
  Filters,
} from '../services/liveApi';
import { requestSync, errorMessage, onSyncRequested } from '../services/sync';

interface CrmPageProps {
  users: User[];
}

type Tab = 'pipeline' | 'contacts' | 'companies' | 'setup' | 'lists';

const card = 'bg-[#FFFFFF] border border-[#E8E1D6] rounded-xl';
const btn = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide disabled:opacity-50';
const ghost = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8F4] text-[#78716A] hover:text-[#2B2A27] text-xs border border-[#E8E1D6] disabled:opacity-50';
const label = 'block text-xs font-mono text-[#78716A] uppercase mb-1';
const money = (v: number | null, currency = 'USD') =>
  v === null ? '$•••,•••' : v.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Turns a datetime-local value + IANA zone into ISO-8601 with that zone's offset at that moment. */
function toZonedIso(local: string, timeZone: string): string {
  const asUtc = new Date(`${local}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(asUtc)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const zonedAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((zonedAsUtc - asUtc.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${local}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export const CrmPage: React.FC<CrmPageProps> = ({ users }) => {
  const { hasPermission, canViewOpportunityValues } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('pipeline');

  const [pipelines, setPipelines] = useState<ApiPipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [opps, setOpps] = useState<ApiOpportunity[]>([]);
  const [contacts, setContacts] = useState<ApiContact[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [contactFields, setContactFields] = useState<ApiField[]>([]);
  const [lists, setLists] = useState<ApiSavedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const fieldsOf = (pid?: string) => pipelines.find((p) => p.id === pid)?.customFields ?? [];

  const load = useCallback(async () => {
    try {
      const [p, o, c, co, fl, ls] = await Promise.all([
        liveApi.pipelines(),
        liveApi.opportunities(),
        hasPermission('contact:read') ? liveApi.contacts() : Promise.resolve({ items: [] as ApiContact[], pagination: { page: 1, limit: 0, totalItems: 0, totalPages: 1 } }),
        hasPermission('company:read') ? liveApi.companies() : Promise.resolve({ items: [] as ApiCompany[] }),
        liveApi.fields('CONTACT').then((r) => r.items).catch(() => [] as ApiField[]),
        liveApi.lists(),
      ]);
      setPipelines(p.items);
      setPipelineId((cur) => (cur && p.items.some((x) => x.id === cur) ? cur : p.items[0]?.id ?? ''));
      setOpps(o.items);
      setContacts(c.items);
      setCompanies(co.items);
      setContactFields(fl);
      setLists(ls.items);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    void load();
    return onSyncRequested(() => void load());
  }, [load]);

  const refresh = () => {
    void load();
    requestSync();
  };

  // ---------------- Deal detail ----------------
  const [detail, setDetail] = useState<ApiOpportunityDetail | null>(null);
  const [draftValues, setDraftValues] = useState<FieldValues>({});
  const [draftTags, setDraftTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payLink, setPayLink] = useState<string | null>(null);
  const [apptTitle, setApptTitle] = useState('Site visit');
  const [apptStart, setApptStart] = useState('');
  const [apptMinutes, setApptMinutes] = useState(60);
  const [apptZone, setApptZone] = useState(browserZone);

  const openDeal = async (id: string, focusStage?: string) => {
    try {
      const d = await liveApi.opportunity(id);
      setDetail(d);
      setDraftValues(d.customValues || {});
      setDraftTags(d.tags.join(', '));
      setPayAmount(d.value !== null ? String(d.value) : '');
      setPayLink(null);
      setApptTitle(`Site visit: ${d.title}`);
      if (focusStage) showToast('warning', 'Fill the required fields', `Then choose the stage again.`);
    } catch (err) {
      showToast('error', 'Could not open deal', errorMessage(err));
    }
  };

  const moveStage = async (o: ApiOpportunity, stageId: string) => {
    if (stageId === o.stageId) return;
    try {
      await liveApi.updateOpportunity(o.id, { stageId, version: o.version });
      showToast('success', 'Stage changed', `Moved to ${pipeline?.stages.find((s) => s.id === stageId)?.name}.`);
      refresh();
    } catch (err) {
      // F2.4: the server names the missing fields; open the deal so they can be filled.
      showToast('error', 'Move blocked', errorMessage(err));
      void openDeal(o.id, stageId);
    }
  };

  const saveDeal = async (stageId?: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      const tags = draftTags.split(',').map((t) => t.trim()).filter(Boolean);
      await liveApi.updateOpportunity(detail.id, { customValues: draftValues, tags, ...(stageId ? { stageId } : {}), version: detail.version });
      showToast('success', 'Saved', stageId ? 'Fields saved and stage changed.' : 'Deal updated.');
      await openDeal(detail.id);
      refresh();
    } catch (err) {
      showToast('error', 'Not saved', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const requestPayment = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await liveApi.requestPayment(detail.id, Number(payAmount), detail.currency);
      setPayLink(r.checkoutUrl);
      showToast('success', 'Payment link created', r.testModeHint);
      await openDeal(detail.id);
      setPayLink(r.checkoutUrl);
    } catch (err) {
      showToast('error', 'Payment link failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const bookAppointment = async () => {
    if (!detail || !apptStart) return;
    setBusy(true);
    try {
      const start = toZonedIso(apptStart, apptZone);
      const endLocal = new Date(new Date(`${apptStart}:00Z`).getTime() + apptMinutes * 60000).toISOString().slice(0, 16);
      const r = await liveApi.bookAppointment({
        title: apptTitle,
        startTime: start,
        endTime: toZonedIso(endLocal, apptZone),
        timezone: apptZone,
        contactId: detail.contactId ?? undefined,
        leadId: detail.leadId ?? undefined,
      });
      showToast('success', 'Booked in Google Calendar', `${r.localStart} (${r.timezone})`);
      requestSync();
    } catch (err) {
      showToast('error', 'Not booked', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- New deal ----------------
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [nd, setNd] = useState({ title: '', value: '', currency: 'USD', contactId: '', tags: '' });
  const [ndValues, setNdValues] = useState<FieldValues>({});
  const createDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await liveApi.createOpportunity({
        title: nd.title,
        value: Number(nd.value || 0),
        currency: nd.currency,
        pipelineId: pipeline?.id,
        contactId: nd.contactId || undefined,
        tags: nd.tags.split(',').map((t) => t.trim()).filter(Boolean),
        customValues: Object.fromEntries(Object.entries(ndValues).filter(([, v]) => v !== null && v !== '')),
      });
      showToast('success', 'Deal created', nd.title);
      setNewDealOpen(false);
      setNd({ title: '', value: '', currency: 'USD', contactId: '', tags: '' });
      setNdValues({});
      refresh();
    } catch (err) {
      showToast('error', 'Deal not created', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Setup: pipelines, stages, fields ----------------
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; moveTo: string } | null>(null);
  const [fieldForm, setFieldForm] = useState<{ open: boolean; entity: 'OPPORTUNITY' | 'CONTACT'; label: string; type: FieldType; options: string }>({
    open: false, entity: 'OPPORTUNITY', label: '', type: 'TEXT', options: '',
  });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast('success', ok, 'Saved on the server.');
      refresh();
    } catch (err) {
      showToast('error', 'Not saved', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const moveStageOrder = (index: number, dir: -1 | 1) => {
    if (!pipeline) return;
    const ids = pipeline.stages.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void run(() => liveApi.reorderStages(pipeline.id, ids), 'Stages reordered');
  };

  const toggleRequired = (stageId: string, current: string[], fieldId: string) => {
    const next = current.includes(fieldId) ? current.filter((x) => x !== fieldId) : [...current, fieldId];
    void run(() => liveApi.updateStage(stageId, { requiredFieldIds: next }), 'Stage requirement updated');
  };

  // ---------------- Saved lists ----------------
  const [filters, setFilters] = useState<{ stageId: string; assignedUserId: string; tag: string; createdFrom: string; fieldKey: string; fieldOp: 'eq' | 'contains' | 'gte' | 'lte'; fieldValue: string }>({
    stageId: '', assignedUserId: '', tag: '', createdFrom: '', fieldKey: '', fieldOp: 'eq', fieldValue: '',
  });
  const [listName, setListName] = useState('');
  const [preview, setPreview] = useState<ApiOpportunity[] | null>(null);
  const [openList, setOpenList] = useState<{ name: string; items: ApiOpportunity[] } | null>(null);
  const buildFilters = (): Filters => {
    const f: Filters = { pipelineId: pipeline?.id };
    if (filters.stageId) f.stageId = filters.stageId;
    if (filters.assignedUserId) f.assignedUserId = filters.assignedUserId;
    if (filters.tag) f.tag = filters.tag;
    if (filters.createdFrom) f.createdFrom = new Date(filters.createdFrom).toISOString();
    if (filters.fieldKey && filters.fieldValue !== '') {
      const field = fieldsOf(pipeline?.id).find((x) => x.key === filters.fieldKey);
      const value = field?.type === 'NUMBER' ? Number(filters.fieldValue) : field?.type === 'CHECKBOX' ? filters.fieldValue === 'true' : filters.fieldValue;
      f.fields = [{ key: filters.fieldKey, op: filters.fieldOp, value }];
    }
    return f;
  };
  const criteriaCount = (f: Filters) => Object.keys(f).filter((k) => k !== 'pipelineId').length + (f.fields ? f.fields.length - 1 : 0);
  const runPreview = async () => {
    try {
      const f = buildFilters();
      const r = await liveApi.opportunities({
        pipelineId: f.pipelineId, stageId: f.stageId, assignedUserId: f.assignedUserId, tag: f.tag, createdFrom: f.createdFrom,
        fields: f.fields ? JSON.stringify(f.fields) : undefined,
      });
      setPreview(r.items);
    } catch (err) {
      showToast('error', 'Filter failed', errorMessage(err));
    }
  };

  // ---------------- Contacts & companies ----------------
  const [contactDetail, setContactDetail] = useState<Awaited<ReturnType<typeof liveApi.contact>> | null>(null);
  const [newContact, setNewContact] = useState<{ open: boolean; firstName: string; lastName: string; email: string; phone: string; companyId: string }>({
    open: false, firstName: '', lastName: '', email: '', phone: '', companyId: '',
  });
  const [newCompany, setNewCompany] = useState({ open: false, name: '', domain: '' });

  const stageName = (id: string) => pipeline?.stages.find((s) => s.id === id)?.name ?? '—';
  const pipelineOpps = useMemo(() => opps.filter((o) => o.pipelineId === pipeline?.id), [opps, pipeline]);
  const detailFields = detail?.fields ?? [];

  const tabBtn = (id: Tab, icon: React.ReactNode, text: string) => (
    <button
      onClick={() => setTab(id)}
      className={`pb-3 border-b-2 font-medium flex items-center gap-2 whitespace-nowrap ${tab === id ? 'border-[#4F7F6D] text-[#4F7F6D]' : 'border-transparent text-[#78716A] hover:text-[#2B2A27]'}`}
    >
      {icon}
      <span>{text}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E1D6] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2B2A27]">CRM & Pipelines</h1>
          <p className="text-xs text-[#78716A] mt-0.5">Deals, contacts, companies, custom fields and stage rules — all stored on the server</p>
          {loadError && <p className="text-xs text-[#B9524C] mt-1">Could not load: {loadError}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pipelines.length > 0 && (
            <select aria-label="Pipeline" value={pipeline?.id ?? ''} onChange={(e) => setPipelineId(e.target.value)} className={`${inputCls} w-auto`}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {tab === 'pipeline' && hasPermission('opportunity:create') && (
            <button className={btn} onClick={() => setNewDealOpen(true)}><Plus className="h-4 w-4" /> New Deal</button>
          )}
          {tab === 'contacts' && hasPermission('contact:create') && (
            <button className={btn} onClick={() => setNewContact({ ...newContact, open: true })}><Plus className="h-4 w-4" /> Add Contact</button>
          )}
          {tab === 'companies' && hasPermission('company:create') && (
            <button className={btn} onClick={() => setNewCompany({ ...newCompany, open: true })}><Plus className="h-4 w-4" /> Add Company</button>
          )}
        </div>
      </div>

      <div className="flex border-b border-[#E8E1D6] gap-4 text-xs font-mono overflow-x-auto">
        {tabBtn('pipeline', <Layers className="h-3.5 w-3.5" />, `Pipeline (${pipelineOpps.length})`)}
        {tabBtn('contacts', <Users className="h-3.5 w-3.5" />, `Contacts (${contacts.length})`)}
        {tabBtn('companies', <Building2 className="h-3.5 w-3.5" />, `Companies (${companies.length})`)}
        {tabBtn('setup', <Settings2 className="h-3.5 w-3.5" />, 'Fields & Stages')}
        {tabBtn('lists', <ListFilter className="h-3.5 w-3.5" />, `Saved Lists (${lists.length})`)}
      </div>

      {loading && <div className="text-xs text-[#78716A]">Loading from the server…</div>}

      {/* ---------------- PIPELINE BOARD ---------------- */}
      {tab === 'pipeline' && pipeline && (
        <div className="space-y-3">
          <div className="text-[11px] font-mono text-[#78716A]">
            {canViewOpportunityValues ? 'Deal values visible for your role' : 'Deal values hidden for your role (enforced by the server)'}
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-2">
            {pipeline.stages.map((stage) => {
              const deals = pipelineOpps.filter((o) => o.stageId === stage.id);
              const total = deals.reduce((s, d) => s + (d.value ?? 0), 0);
              const required = pipeline.customFields.filter((f) => stage.requiredFieldIds.includes(f.id));
              return (
                <div key={stage.id} className={`${card} min-w-[230px] w-[230px] flex flex-col`}>
                  <div className="p-3 border-b border-[#E8E1D6] bg-[#FAF8F4] rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#2B2A27] truncate">{stage.name}</span>
                      <span className="px-1.5 rounded text-[10px] font-mono bg-[#FFFFFF] border border-[#E8E1D6] text-[#4F7F6D]">{deals.length}</span>
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-[#78716A]">{canViewOpportunityValues ? money(total) : '$•••,•••'}</div>
                    {required.length > 0 && (
                      <div className="mt-1 text-[10px] text-[#B97F2E]">Requires: {required.map((f) => f.label).join(', ')}</div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-2.5 max-h-[520px] overflow-y-auto">
                    {deals.length === 0 && <div className="text-[11px] font-mono text-[#78716A]/60 text-center py-6">No deals</div>}
                    {deals.map((o) => (
                      <div key={o.id} className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] hover:border-[#4F7F6D]/50 space-y-1.5">
                        <button onClick={() => void openDeal(o.id)} className="text-left text-xs font-semibold text-[#2B2A27] hover:text-[#4F7F6D] leading-snug">
                          {o.title}
                        </button>
                        <div className="text-[11px] font-mono text-[#4F7F6D] font-bold">{money(o.value, o.currency)}</div>
                        {o.contact && <div className="text-[10px] text-[#78716A] truncate">{o.contact.name}</div>}
                        {o.assignedUser && <div className="text-[10px] text-[#78716A] truncate">Owner: {o.assignedUser.name}</div>}
                        {o.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">{o.tags.map((t) => <span key={t} className="text-[9px] font-mono px-1.5 rounded bg-[#E8E1D6] text-[#78716A]">{t}</span>)}</div>
                        )}
                        {hasPermission('opportunity:update') && (
                          <div className="pt-1.5 border-t border-[#E8E1D6] flex items-center justify-between gap-1">
                            <span className="text-[10px] text-[#78716A]">Stage:</span>
                            <select aria-label={`Stage for ${o.title}`} value={o.stageId} onChange={(e) => void moveStage(o, e.target.value)} className="px-1.5 py-0.5 rounded bg-[#FFFFFF] border border-[#E8E1D6] text-[10px] text-[#2B2A27] max-w-[140px]">
                              {pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- CONTACTS ---------------- */}
      {tab === 'contacts' && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#FAF8F4] border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Email / Phone</th>
                  <th className="py-3 px-4">Messaging</th>
                  <th className="py-3 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D6]">
                {contacts.length === 0 && <tr><td colSpan={5} className="py-4 px-4 text-[#78716A]">No contacts yet. Leads create contacts automatically.</td></tr>}
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F3EEE6]/50 cursor-pointer" onClick={() => void liveApi.contact(c.id).then(setContactDetail).catch((err) => showToast('error', 'Could not open', errorMessage(err)))}>
                    <td className="py-3 px-4 font-semibold text-[#2B2A27]">{c.firstName} {c.lastName}</td>
                    <td className="py-3 px-4 text-[#78716A]">{c.company?.name ?? '—'}</td>
                    <td className="py-3 px-4 font-mono text-[#78716A]"><div>{c.email ?? '—'}</div>{c.phone && <div className="text-[10px]">{c.phone}</div>}</td>
                    <td className="py-3 px-4">{c.optedOut ? <span className="text-[10px] font-mono text-[#B9524C]">OPTED OUT</span> : <span className="text-[10px] font-mono text-[#4F7F6D]">OK</span>}</td>
                    <td className="py-3 px-4 text-right"><span className="text-xs font-mono text-[#4F7F6D] inline-flex items-center gap-1">Open <ChevronRight className="h-3 w-3" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- COMPANIES ---------------- */}
      {tab === 'companies' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.length === 0 && <div className="text-xs text-[#78716A]">No companies yet.</div>}
          {companies.map((co) => (
            <div key={co.id} className={`${card} p-5 space-y-2`}>
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#4F7F6D]" /><h3 className="text-sm font-bold text-[#2B2A27]">{co.name}</h3></div>
              <div className="text-xs text-[#78716A]">{co.domain ?? 'No domain'}</div>
              <div className="text-[11px] font-mono text-[#78716A]">{co._count?.contacts ?? 0} contacts · {co._count?.opportunities ?? 0} deals</div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- FIELDS & STAGES ---------------- */}
      {tab === 'setup' && pipeline && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#2B2A27]">Stages of “{pipeline.name}”</h3>
                <p className="text-xs text-[#78716A]">Add, rename, reorder and delete. Tick the fields a deal must have to enter a stage.</p>
              </div>
            </div>
            {!hasPermission('pipeline:manage') && <div className="text-xs text-[#B97F2E]">Your role can view but not change stages.</div>}
            <div className="space-y-2.5">
              {pipeline.stages.map((s, i) => (
                <div key={s.id} className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#78716A] w-5">{i + 1}.</span>
                    {renaming?.id === s.id ? (
                      <>
                        <input aria-label="Stage name" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={inputCls} />
                        <button className={ghost} disabled={busy} onClick={() => { const r = renaming; setRenaming(null); void run(() => liveApi.updateStage(r.id, { name: r.name }), 'Stage renamed'); }}>Save</button>
                      </>
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-[#2B2A27]">{s.name}{s.isWonStage && ' (won)'}{s.isLostStage && ' (lost)'}</span>
                    )}
                    {hasPermission('pipeline:manage') && renaming?.id !== s.id && (
                      <div className="flex items-center gap-1">
                        <button aria-label="Move up" className={ghost} disabled={busy || i === 0} onClick={() => moveStageOrder(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button aria-label="Move down" className={ghost} disabled={busy || i === pipeline.stages.length - 1} onClick={() => moveStageOrder(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
                        <button className={ghost} onClick={() => setRenaming({ id: s.id, name: s.name })}>Rename</button>
                        <button aria-label="Delete stage" className={ghost} onClick={() => setDeleting({ id: s.id, name: s.name, moveTo: pipeline.stages.find((x) => x.id !== s.id)?.id ?? '' })}><Trash2 className="h-3.5 w-3.5 text-[#B9524C]" /></button>
                      </div>
                    )}
                  </div>
                  {pipeline.customFields.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-7">
                      {pipeline.customFields.map((f) => (
                        <label key={f.id} className="flex items-center gap-1 text-[11px] text-[#78716A] cursor-pointer">
                          <input type="checkbox" disabled={!hasPermission('pipeline:manage') || busy} checked={s.requiredFieldIds.includes(f.id)} onChange={() => toggleRequired(s.id, s.requiredFieldIds, f.id)} className="accent-[#4F7F6D]" />
                          requires {f.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasPermission('pipeline:manage') && (
              <div className="flex gap-2">
                <input aria-label="New stage name" placeholder="New stage name" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} className={inputCls} />
                <button className={btn} disabled={!newStageName.trim() || busy} onClick={() => { const n = newStageName; setNewStageName(''); void run(() => liveApi.addStage(pipeline.id, n), 'Stage added'); }}>Add</button>
              </div>
            )}
            {hasPermission('pipeline:manage') && (
              <div className="pt-3 border-t border-[#E8E1D6] flex gap-2">
                <input aria-label="New pipeline name" placeholder="Create another pipeline (e.g. Maintenance)" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} className={inputCls} />
                <button className={ghost} disabled={!newPipelineName.trim() || busy} onClick={() => { const n = newPipelineName; setNewPipelineName(''); void run(() => liveApi.createPipeline(n, ['New', 'In progress', 'Won', 'Lost']), 'Pipeline created'); }}>
                  <Plus className="h-3.5 w-3.5" /> Pipeline
                </button>
              </div>
            )}
          </div>

          <div className={`${card} p-5 space-y-4`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#2B2A27]">Custom fields</h3>
                <p className="text-xs text-[#78716A]">Deal fields belong to this pipeline; contact fields are shared by all pipelines.</p>
              </div>
              {hasPermission('field:manage') && (
                <button className={btn} onClick={() => setFieldForm({ ...fieldForm, open: true })}><Plus className="h-4 w-4" /> Field</button>
              )}
            </div>
            {[...pipeline.customFields.map((f) => ({ f, scope: `Deals · ${pipeline.name}` })), ...contactFields.map((f) => ({ f, scope: 'Contacts · all pipelines' }))].map(({ f, scope }) => (
              <div key={f.id} className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#2B2A27]">{f.label}</div>
                  <div className="text-[10px] font-mono text-[#78716A]">{f.type}{f.options.length ? ` · ${f.options.join(' / ')}` : ''} · {scope}</div>
                </div>
                {hasPermission('field:manage') && (
                  <button aria-label={`Archive ${f.label}`} className={ghost} disabled={busy} onClick={() => void run(() => liveApi.archiveField(f.id), 'Field archived (stored values kept)')}><Trash2 className="h-3.5 w-3.5 text-[#B9524C]" /></button>
                )}
              </div>
            ))}
            {pipeline.customFields.length === 0 && contactFields.length === 0 && <div className="text-xs text-[#78716A]">No custom fields yet.</div>}
          </div>
        </div>
      )}

      {/* ---------------- SAVED LISTS ---------------- */}
      {tab === 'lists' && pipeline && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className={`${card} p-5 space-y-3`}>
            <h3 className="text-base font-bold text-[#2B2A27]">Build a filter</h3>
            <p className="text-xs text-[#78716A]">Combine criteria, preview, then save. A saved list stores the criteria, so it updates as deals change.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor="flt-stage">Stage</label>
                <select id="flt-stage" value={filters.stageId} onChange={(e) => setFilters({ ...filters, stageId: e.target.value })} className={inputCls}>
                  <option value="">Any</option>{pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className={label} htmlFor="flt-owner">Owner</label>
                <select id="flt-owner" value={filters.assignedUserId} onChange={(e) => setFilters({ ...filters, assignedUserId: e.target.value })} className={inputCls}>
                  <option value="">Anyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select></div>
              <div><label className={label} htmlFor="flt-tag">Tag</label>
                <input id="flt-tag" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} className={inputCls} placeholder="e.g. hot" /></div>
              <div><label className={label} htmlFor="flt-date">Created from</label>
                <input id="flt-date" type="date" value={filters.createdFrom} onChange={(e) => setFilters({ ...filters, createdFrom: e.target.value })} className={inputCls} /></div>
              <div><label className={label} htmlFor="flt-field">Custom field</label>
                <select id="flt-field" value={filters.fieldKey} onChange={(e) => setFilters({ ...filters, fieldKey: e.target.value })} className={inputCls}>
                  <option value="">None</option>{pipeline.customFields.map((f) => <option key={f.id} value={f.key}>{f.label}</option>)}
                </select></div>
              <div className="flex gap-2">
                <div className="w-24"><label className={label} htmlFor="flt-op">Op</label>
                  <select id="flt-op" value={filters.fieldOp} onChange={(e) => setFilters({ ...filters, fieldOp: e.target.value as typeof filters.fieldOp })} className={inputCls}>
                    <option value="eq">=</option><option value="contains">contains</option><option value="gte">≥</option><option value="lte">≤</option>
                  </select></div>
                <div className="flex-1"><label className={label} htmlFor="flt-val">Value</label>
                  <input id="flt-val" value={filters.fieldValue} onChange={(e) => setFilters({ ...filters, fieldValue: e.target.value })} className={inputCls} /></div>
              </div>
            </div>
            <div className="text-[11px] font-mono text-[#78716A]">{criteriaCount(buildFilters())} criteria selected</div>
            <div className="flex gap-2 flex-wrap">
              <button className={ghost} onClick={() => void runPreview()}>Preview</button>
              <input aria-label="List name" placeholder="List name" value={listName} onChange={(e) => setListName(e.target.value)} className={`${inputCls} flex-1 min-w-[140px]`} />
              <button className={btn} disabled={!listName.trim() || busy} onClick={() => { const n = listName; setListName(''); void run(() => liveApi.createList(n, buildFilters()), 'List saved'); }}>Save list</button>
            </div>
            {preview && (
              <div className="space-y-1.5 pt-2 border-t border-[#E8E1D6]">
                <div className="text-xs text-[#78716A]">{preview.length} matching deal(s)</div>
                {preview.map((o) => <div key={o.id} className="text-xs text-[#2B2A27]">• {o.title} <span className="text-[#78716A]">({stageName(o.stageId)})</span></div>)}
              </div>
            )}
          </div>
          <div className={`${card} p-5 space-y-3`}>
            <h3 className="text-base font-bold text-[#2B2A27]">Saved lists</h3>
            {lists.length === 0 && <div className="text-xs text-[#78716A]">No saved lists yet.</div>}
            {lists.map((l) => (
              <div key={l.id} className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] flex items-center justify-between gap-2">
                <button className="text-left" onClick={() => void liveApi.listItems(l.id).then((r) => setOpenList({ name: l.name, items: r.items })).catch((err) => showToast('error', 'Could not open list', errorMessage(err)))}>
                  <div className="text-sm font-semibold text-[#2B2A27] hover:text-[#4F7F6D]">{l.name}</div>
                  <div className="text-[10px] font-mono text-[#78716A]">{l.count ?? '—'} matching now · {criteriaCount(l.filters)} criteria</div>
                </button>
                <button aria-label={`Delete ${l.name}`} className={ghost} onClick={() => void run(() => liveApi.deleteList(l.id), 'List deleted')}><Trash2 className="h-3.5 w-3.5 text-[#B9524C]" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- MODALS ---------------- */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''} subtitle={detail ? `${money(detail.value, detail.currency)} · ${detail.stage?.name ?? ''} · ${detail.contact?.name ?? 'no contact'}` : ''} maxWidth="xl">
        {detail && (
          <div className="space-y-5 text-xs">
            <div className="space-y-3">
              <div className="text-[11px] font-mono text-[#78716A] uppercase">Fields ({fieldsOf(detail.pipelineId).length})</div>
              {detailFields.length === 0 && <div className="text-[#78716A]">This pipeline has no custom fields. Add some under “Fields & Stages”.</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detailFields.map((f) => (
                  <FieldInput key={f.id} field={f} value={draftValues[f.key]} onChange={(v) => setDraftValues({ ...draftValues, [f.key]: v })}
                    required={detail.stages.some((s) => s.requiredFields.includes(f.key))} />
                ))}
              </div>
              <div><label className={label} htmlFor="deal-tags">Tags (comma separated)</label>
                <input id="deal-tags" value={draftTags} onChange={(e) => setDraftTags(e.target.value)} className={inputCls} /></div>
              {hasPermission('opportunity:update') && (
                <div className="flex flex-wrap items-center gap-2">
                  <button className={btn} disabled={busy} onClick={() => void saveDeal()}>Save fields</button>
                  <span className="text-[#78716A]">or save and move to</span>
                  {detail.stages.filter((s) => s.id !== detail.stageId).map((s) => (
                    <button key={s.id} className={ghost} disabled={busy} onClick={() => void saveDeal(s.id)}>
                      {s.name}{s.requiredFields.length ? ` (needs ${s.requiredFields.length})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-[#E8E1D6] rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-mono text-[#78716A] uppercase flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-[#4F7F6D]" /> Payments (Stripe test mode)</div>
              {detail.payments.length === 0 && <div className="text-[#78716A]">No payment requests yet.</div>}
              {detail.payments.map((p) => (
                <div key={p.id} className="p-2 rounded bg-[#FAF8F4] flex items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="text-[#2B2A27]">{p.amount === null ? '$•••' : money(p.amount / 100, p.currency.toUpperCase())}{p.refundedAmount ? ` (refunded ${money((p.refundedAmount ?? 0) / 100, p.currency.toUpperCase())})` : ''}</span>
                  <span className={p.status === 'PAID' ? 'text-[#4F7F6D]' : p.status === 'PENDING' ? 'text-[#B97F2E]' : 'text-[#B9524C]'}>{p.status}{p.failureReason ? ` · ${p.failureReason}` : ''}</span>
                </div>
              ))}
              {hasPermission('payment:create') && (
                <div className="flex gap-2 items-end flex-wrap">
                  <div><label className={label} htmlFor="pay-amt">Amount ({detail.currency})</label>
                    <input id="pay-amt" type="number" min="0.5" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={`${inputCls} w-36`} /></div>
                  <button className={btn} disabled={busy || !payAmount} onClick={() => void requestPayment()}>Create payment link</button>
                </div>
              )}
              {payLink && (
                <div className="p-2 rounded bg-[#FAF8F4] border border-[#4F7F6D]/30 space-y-1">
                  <div className="text-[#78716A]">Send this link to the customer (test card 4242 4242 4242 4242):</div>
                  <div className="flex items-center gap-2">
                    <a href={payLink} target="_blank" rel="noreferrer" className="text-[#4F7F6D] underline truncate">{payLink}</a>
                    <button aria-label="Copy link" className={ghost} onClick={() => void navigator.clipboard.writeText(payLink).then(() => showToast('success', 'Copied', 'Payment link copied'))}><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="text-[10px] text-[#78716A]">The status turns PAID by itself when Stripe confirms the payment.</div>
                </div>
              )}
            </div>

            {hasPermission('appointment:create') && (
              <div className="border border-[#E8E1D6] rounded-lg p-3 space-y-2">
                <div className="text-[11px] font-mono text-[#78716A] uppercase flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-[#4F7F6D]" /> Book appointment (your Google Calendar)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><label className={label} htmlFor="ap-title">Title</label><input id="ap-title" value={apptTitle} onChange={(e) => setApptTitle(e.target.value)} className={inputCls} /></div>
                  <div><label className={label} htmlFor="ap-start">Start</label><input id="ap-start" type="datetime-local" value={apptStart} onChange={(e) => setApptStart(e.target.value)} className={inputCls} /></div>
                  <div><label className={label} htmlFor="ap-min">Minutes</label><input id="ap-min" type="number" min={15} step={15} value={apptMinutes} onChange={(e) => setApptMinutes(Number(e.target.value))} className={inputCls} /></div>
                  <div><label className={label} htmlFor="ap-tz">Time zone</label><input id="ap-tz" value={apptZone} onChange={(e) => setApptZone(e.target.value)} className={inputCls} /></div>
                </div>
                <button className={btn} disabled={busy || !apptStart} onClick={() => void bookAppointment()}>Book</button>
                <div className="text-[10px] text-[#78716A]">Clashes with your calendar are refused with the busy times. Connect Google under Integrations first.</div>
              </div>
            )}

            {detail.history.length > 0 && (
              <div className="border border-[#E8E1D6] rounded-lg p-3 space-y-1.5">
                <div className="text-[11px] font-mono text-[#78716A] uppercase">History</div>
                {detail.history.map((h, i) => (
                  <div key={i} className="text-[11px] text-[#78716A]"><span className="font-mono">{new Date(h.at).toLocaleString()}</span> · <span className="text-[#2B2A27]">{h.action}</span> by {h.actor}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={newDealOpen} onClose={() => setNewDealOpen(false)} title="New deal" subtitle={`Pipeline: ${pipeline?.name ?? ''}`}>
        <form onSubmit={createDeal} className="space-y-3">
          <div><label className={label} htmlFor="nd-title">Title *</label><input id="nd-title" required value={nd.title} onChange={(e) => setNd({ ...nd, title: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="nd-val">Value</label><input id="nd-val" type="number" min="0" value={nd.value} onChange={(e) => setNd({ ...nd, value: e.target.value })} className={inputCls} /></div>
            <div><label className={label} htmlFor="nd-cur">Currency</label><input id="nd-cur" value={nd.currency} onChange={(e) => setNd({ ...nd, currency: e.target.value.toUpperCase() })} className={inputCls} /></div>
          </div>
          <div><label className={label} htmlFor="nd-contact">Contact</label>
            <select id="nd-contact" value={nd.contactId} onChange={(e) => setNd({ ...nd, contactId: e.target.value })} className={inputCls}>
              <option value="">None</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select></div>
          <div><label className={label} htmlFor="nd-tags">Tags</label><input id="nd-tags" value={nd.tags} onChange={(e) => setNd({ ...nd, tags: e.target.value })} className={inputCls} placeholder="hot, referral" /></div>
          {fieldsOf(pipeline?.id).map((f) => (
            <FieldInput key={f.id} field={f} value={ndValues[f.key]} onChange={(v) => setNdValues({ ...ndValues, [f.key]: v })} />
          ))}
          <div className="border-t border-[#E8E1D6] pt-3 flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setNewDealOpen(false)}>Cancel</button>
            <button type="submit" className={btn} disabled={busy}>{busy ? 'Saving…' : 'Create deal'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={fieldForm.open} onClose={() => setFieldForm({ ...fieldForm, open: false })} title="New custom field" subtitle="Appears on forms immediately — no code">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = fieldForm;
          setFieldForm({ ...fieldForm, open: false, label: '', options: '' });
          void run(() => liveApi.createField({
            entity: f.entity,
            pipelineId: f.entity === 'OPPORTUNITY' ? pipeline?.id : undefined,
            label: f.label,
            type: f.type,
            options: f.type === 'DROPDOWN' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
          }), 'Field created');
        }}>
          <div><label className={label} htmlFor="ff-entity">Applies to</label>
            <select id="ff-entity" value={fieldForm.entity} onChange={(e) => setFieldForm({ ...fieldForm, entity: e.target.value as 'OPPORTUNITY' | 'CONTACT' })} className={inputCls}>
              <option value="OPPORTUNITY">Deals in “{pipeline?.name}”</option><option value="CONTACT">All contacts</option>
            </select></div>
          <div><label className={label} htmlFor="ff-label">Name *</label><input id="ff-label" required value={fieldForm.label} onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })} className={inputCls} placeholder="e.g. Roof type" /></div>
          <div><label className={label} htmlFor="ff-type">Type</label>
            <select id="ff-type" value={fieldForm.type} onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value as FieldType })} className={inputCls}>
              <option value="TEXT">Text</option><option value="NUMBER">Number</option><option value="DATE">Date</option><option value="DROPDOWN">Dropdown</option><option value="CHECKBOX">Checkbox</option>
            </select></div>
          {fieldForm.type === 'DROPDOWN' && (
            <div><label className={label} htmlFor="ff-opts">Options (comma separated, at least 2)</label><input id="ff-opts" required value={fieldForm.options} onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })} className={inputCls} placeholder="Flat, Sloped, Metal" /></div>
          )}
          <div className="border-t border-[#E8E1D6] pt-3 flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setFieldForm({ ...fieldForm, open: false })}>Cancel</button>
            <button type="submit" className={btn}>Create field</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title={`Delete stage “${deleting?.name}”`} subtitle="Deals in this stage are moved first, so none is left without a stage">
        {deleting && pipeline && (
          <div className="space-y-3 text-xs">
            <div><label className={label} htmlFor="del-move">Move its deals to</label>
              <select id="del-move" value={deleting.moveTo} onChange={(e) => setDeleting({ ...deleting, moveTo: e.target.value })} className={inputCls}>
                {pipeline.stages.filter((s) => s.id !== deleting.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="flex justify-end gap-2">
              <button className={ghost} onClick={() => setDeleting(null)}>Cancel</button>
              <button className="px-4 py-2 rounded-lg bg-[#B9524C] text-white font-semibold text-xs uppercase" onClick={() => { const d = deleting; setDeleting(null); void run(() => liveApi.deleteStage(d.id, d.moveTo), 'Stage deleted'); }}>Delete stage</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={newContact.open} onClose={() => setNewContact({ ...newContact, open: false })} title="Add contact">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const c = newContact;
          setNewContact({ open: false, firstName: '', lastName: '', email: '', phone: '', companyId: '' });
          void run(() => liveApi.createContact({ firstName: c.firstName, lastName: c.lastName, email: c.email || undefined, phone: c.phone || undefined, companyId: c.companyId || undefined }), 'Contact added');
        }}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="nc-first">First name *</label><input id="nc-first" required value={newContact.firstName} onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })} className={inputCls} /></div>
            <div><label className={label} htmlFor="nc-last">Last name</label><input id="nc-last" value={newContact.lastName} onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })} className={inputCls} /></div>
            <div><label className={label} htmlFor="nc-email">Email</label><input id="nc-email" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} className={inputCls} /></div>
            <div><label className={label} htmlFor="nc-phone">Phone (+country code)</label><input id="nc-phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} className={inputCls} /></div>
          </div>
          <div><label className={label} htmlFor="nc-co">Company</label>
            <select id="nc-co" value={newContact.companyId} onChange={(e) => setNewContact({ ...newContact, companyId: e.target.value })} className={inputCls}>
              <option value="">None</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="text-[10px] text-[#78716A]">Email or phone is required.</div>
          <div className="border-t border-[#E8E1D6] pt-3 flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setNewContact({ ...newContact, open: false })}>Cancel</button>
            <button type="submit" className={btn}>Save contact</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={newCompany.open} onClose={() => setNewCompany({ ...newCompany, open: false })} title="Add company">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const c = newCompany;
          setNewCompany({ open: false, name: '', domain: '' });
          void run(() => liveApi.createCompany({ name: c.name, domain: c.domain || undefined }), 'Company added');
        }}>
          <div><label className={label} htmlFor="nco-name">Name *</label><input id="nco-name" required value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} className={inputCls} /></div>
          <div><label className={label} htmlFor="nco-dom">Domain</label><input id="nco-dom" value={newCompany.domain} onChange={(e) => setNewCompany({ ...newCompany, domain: e.target.value })} className={inputCls} /></div>
          <div className="border-t border-[#E8E1D6] pt-3 flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setNewCompany({ ...newCompany, open: false })}>Cancel</button>
            <button type="submit" className={btn}>Save company</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!openList} onClose={() => setOpenList(null)} title={openList?.name ?? ''} subtitle="Evaluated now from the saved criteria">
        <div className="space-y-1.5 text-xs">
          {openList?.items.length === 0 && <div className="text-[#78716A]">No deals match right now.</div>}
          {openList?.items.map((o) => <div key={o.id} className="text-[#2B2A27]">• {o.title} <span className="text-[#78716A]">({o.stage?.name})</span></div>)}
        </div>
      </Modal>

      <Modal isOpen={!!contactDetail} onClose={() => setContactDetail(null)} title={contactDetail ? `${contactDetail.contact.firstName} ${contactDetail.contact.lastName}` : ''} subtitle={contactDetail ? `Assigned employee: ${contactDetail.assignedEmployee?.name ?? '—'}` : ''} maxWidth="xl">
        {contactDetail && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-[#FAF8F4] rounded-lg border border-[#E8E1D6]">
              <div><div className="text-[10px] font-mono text-[#78716A] uppercase">Email / phone</div><div className="text-[#2B2A27]">{contactDetail.contact.email ?? '—'}</div><div className="text-[#78716A]">{contactDetail.contact.phone ?? ''}</div></div>
              <div><div className="text-[10px] font-mono text-[#78716A] uppercase">Company</div><div className="text-[#2B2A27]">{contactDetail.contact.company?.name ?? '—'}</div>
                <div className={contactDetail.contact.optedOut ? 'text-[#B9524C]' : 'text-[#4F7F6D]'}>{contactDetail.contact.optedOut ? 'Opted out of messages' : 'Can be messaged'}</div></div>
            </div>
            {[
              { title: `Deals (${contactDetail.opportunities.length})`, rows: contactDetail.opportunities.map((o) => `${o.title} · ${o.stage?.name ?? ''} · ${money(o.value, o.currency)}`) },
              { title: `Leads (${contactDetail.leads.length})`, rows: contactDetail.leads.map((l) => `${l.title} · ${l.status} · owner ${l.owner ?? '—'}`) },
              { title: `Messages (${contactDetail.messages.length})`, rows: contactDetail.messages.map((m) => `${m.direction === 'INBOUND' ? '←' : '→'} ${m.body} (${m.status})`) },
              { title: `Payments (${contactDetail.payments.length})`, rows: contactDetail.payments.map((p) => `${p.amount === null ? '$•••' : money(p.amount / 100, p.currency.toUpperCase())} · ${p.status}`) },
              { title: `Appointments (${contactDetail.appointments.length})`, rows: contactDetail.appointments.map((a) => `${a.title} · ${new Date(a.startTime).toLocaleString()} · ${a.status}`) },
              { title: `History (${contactDetail.activity.length})`, rows: contactDetail.activity.map((a) => `${new Date(a.createdAt).toLocaleString()} · ${a.kind}${a.body ? ` · ${a.body}` : ''}`) },
            ].map((sec) => (
              <div key={sec.title} className="border border-[#E8E1D6] rounded-lg p-3 space-y-1">
                <div className="text-[10px] font-mono text-[#78716A] uppercase">{sec.title}</div>
                {sec.rows.length === 0 ? <div className="text-[#78716A]">None</div> : sec.rows.map((r, i) => <div key={i} className="text-[#2B2A27]">{r}</div>)}
              </div>
            ))}
            <div className="flex justify-between items-center pt-1">
              {hasPermission('contact:update') ? (
                <button className={ghost} onClick={() => { const c = contactDetail.contact; void run(() => liveApi.setOptOut(c.id, !c.optedOut), c.optedOut ? 'Contact opted back in' : 'Contact opted out').then(() => liveApi.contact(c.id).then(setContactDetail)); }}>
                  {contactDetail.contact.optedOut ? 'Allow messages again' : 'Mark as opted out'}
                </button>
              ) : <span />}
              <button className={ghost} onClick={() => setContactDetail(null)}>Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
