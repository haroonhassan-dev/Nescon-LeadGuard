import React, { useCallback, useEffect, useState } from 'react';
import { Workflow, MessageSquare, CreditCard, Calendar, Send, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, FileText, Copy } from 'lucide-react';
import { User } from '@shared/user';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { inputCls } from '../components/common/FieldInput';
import {
  liveApi,
  ProviderStatus,
  CalendarStatus,
  ApiPayment,
  ApiAppointment,
  Conversation,
  ConversationDetail,
  Alert,
} from '../services/liveApi';
import { backendService } from '../services/backendService';
import { BackendTeamMember } from '../types';
import { errorMessage, onSyncRequested, requestSync } from '../services/sync';

interface IntegrationsPageProps {
  users: User[];
  isBackendHealthy: boolean | null;
}

type Tab = 'overview' | 'webform' | 'whatsapp' | 'stripe' | 'gcal' | 'telegram';
const card = 'bg-[#FFFFFF] border border-[#E8E1D6] rounded-xl';
const btn = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide disabled:opacity-50';
const ghost = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8F4] text-[#78716A] hover:text-[#2B2A27] text-xs border border-[#E8E1D6] disabled:opacity-50';
const money = (cents: number | null, currency: string) =>
  cents === null ? '$•••' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() });

const Badge: React.FC<{ state: 'ok' | 'warn' | 'bad'; text: string }> = ({ state, text }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
    state === 'ok' ? 'bg-[#4F7F6D]/10 text-[#4F7F6D] border-[#4F7F6D]/30' : state === 'warn' ? 'bg-[#B97F2E]/10 text-[#B97F2E] border-[#B97F2E]/30' : 'bg-[#B9524C]/10 text-[#B9524C] border-[#B9524C]/30'
  }`}>{text}</span>
);

const statusBadge = (s?: string) =>
  s === 'connected' || s === 'CONNECTED' ? <Badge state="ok" text="CONNECTED" /> : s === 'error' || s === 'ERROR' ? <Badge state="bad" text="ERROR" /> : <Badge state="warn" text="NOT CONNECTED" />;

/**
 * Integrations hub (I5.1): live status, last success and recent errors for every provider,
 * plus the real actions — WhatsApp conversations, Stripe payments, Google Calendar, Telegram.
 */
export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ users, isBackendHealthy }) => {
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);

  const canManage = hasPermission('integration:manage');
  const [stripe, setStripe] = useState<ProviderStatus | null>(null);
  const [whatsapp, setWhatsapp] = useState<ProviderStatus | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [team, setTeam] = useState<BackendTeamMember[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next: Record<string, string> = {};
    const attempt = async <T,>(key: string, fn: () => Promise<T>, set: (v: T) => void) => {
      try {
        set(await fn());
      } catch (err) {
        next[key] = errorMessage(err);
      }
    };
    await Promise.all([
      canManage ? attempt('stripe', liveApi.stripeStatus, setStripe) : Promise.resolve(),
      attempt('whatsapp', liveApi.whatsappStatus, setWhatsapp),
      attempt('calendar', liveApi.calendarStatus, setCalendar),
      hasPermission('payment:read') ? attempt('payments', liveApi.payments, (r) => setPayments(r.items)) : Promise.resolve(),
      hasPermission('appointment:read') ? attempt('appointments', () => liveApi.appointments({ upcoming: true }), (r) => setAppointments(r.items)) : Promise.resolve(),
      hasPermission('message:read') ? attempt('conversations', liveApi.conversations, (r) => setConversations(r.items)) : Promise.resolve(),
      attempt('team', backendService.getTeam, (r) => setTeam(r.items)),
      canManage ? attempt('alerts', liveApi.alerts, (r) => setAlerts(r.items)) : Promise.resolve(),
      attempt('webform', liveApi.settings, (r) => setFormKey(r.publicFormKey ?? null)),
    ]);
    setErrors(next);
  }, [canManage, hasPermission]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 8000);
    const off = onSyncRequested(() => void load());
    return () => {
      clearInterval(timer);
      off();
    };
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string, detail = '') => {
    setBusy(true);
    try {
      await fn();
      showToast('success', ok, detail || 'Done.');
      await load();
      requestSync();
    } catch (err) {
      showToast('error', 'Action failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const me = team.find((m) => m.userId === user.id);
  const telegramLinked = !!me?.telegramConfigured;
  const sentAlerts = alerts.filter((a) => a.status === 'SENT').length;
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() : team.find((m) => m.userId === id)?.name ?? 'Team member';
  };

  // ---------------- WhatsApp thread ----------------
  const [openContact, setOpenContact] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [reply, setReply] = useState('');
  const loadThread = useCallback(async (contactId: string) => {
    try {
      setThread(await liveApi.conversation(contactId));
    } catch (err) {
      showToast('error', 'Could not open conversation', errorMessage(err));
    }
  }, [showToast]);
  useEffect(() => {
    if (!openContact) return;
    void loadThread(openContact);
    const t = setInterval(() => void loadThread(openContact), 5000);
    return () => clearInterval(t);
  }, [openContact, loadThread]);
  const sendReply = async () => {
    if (!thread || !reply.trim()) return;
    setBusy(true);
    try {
      const r = await liveApi.sendWhatsApp(thread.contact.id, reply.trim());
      if (r.status === 'FAILED') showToast('error', 'Not delivered', `${r.error ?? 'Provider refused the message'}. You can retry.`);
      else showToast('success', 'Sent', 'Delivery status updates when WhatsApp confirms.');
      setReply('');
      await loadThread(thread.contact.id);
      requestSync();
    } catch (err) {
      showToast('error', 'Not sent', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Calendar ----------------
  const connectGoogle = async () => {
    try {
      const { url } = await liveApi.calendarConnectUrl();
      window.open(url, '_blank', 'noopener');
      showToast('info', 'Finish in the Google tab', 'Then come back; the status updates by itself.');
    } catch (err) {
      showToast('error', 'Google not available', errorMessage(err));
    }
  };

  const tabBtn = (id: Tab, icon: React.ReactNode, text: string) => (
    <button onClick={() => setTab(id)} className={`pb-3 border-b-2 font-medium flex items-center gap-2 whitespace-nowrap ${tab === id ? 'border-[#4F7F6D] text-[#4F7F6D]' : 'border-transparent text-[#78716A] hover:text-[#2B2A27]'}`}>
      {icon}<span>{text}</span>
    </button>
  );

  const providerCard = (opts: { icon: React.ReactNode; title: string; subtitle: string; badge: React.ReactNode; lines: React.ReactNode[]; onOpen: () => void }) => (
    <button onClick={opts.onOpen} className={`${card} p-5 space-y-3 text-left hover:border-[#4F7F6D]/40`}>
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] flex items-center justify-center text-[#4F7F6D]">{opts.icon}</div>
        {opts.badge}
      </div>
      <div><h3 className="text-base font-bold text-[#2B2A27]">{opts.title}</h3><p className="text-xs text-[#78716A]">{opts.subtitle}</p></div>
      <div className="text-[11px] font-mono text-[#78716A] border-t border-[#E8E1D6] pt-2 space-y-0.5">{opts.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
    </button>
  );

  const limits = (list?: string[]) =>
    list && list.length > 0 && (
      <div className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[11px] text-[#78716A] space-y-1">
        <div className="font-semibold text-[#2B2A27]">What this integration can and cannot do</div>
        {list.map((l) => <div key={l}>• {l}</div>)}
      </div>
    );

  const recentErrors = (s?: ProviderStatus | null) =>
    s && s.recentErrors.length > 0 && (
      <div className="p-3 rounded-lg bg-[#B9524C]/5 border border-[#B9524C]/30 text-[11px] space-y-1">
        <div className="font-semibold text-[#B9524C] flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Recent errors</div>
        {s.recentErrors.slice(0, 5).map((e, i) => <div key={i} className="text-[#78716A]"><span className="font-mono">{new Date(e.at).toLocaleString()}</span> · {e.type} · {e.result}{e.detail ? ` — ${e.detail}` : ''}</div>)}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E1D6] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2B2A27]">Integrations</h1>
          <p className="text-xs text-[#78716A] mt-0.5">Real providers in sandbox / test mode — status, last success and errors come from the server</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#78716A]">API</span>
          {isBackendHealthy ? <Badge state="ok" text="ONLINE" /> : <Badge state="bad" text="OFFLINE" />}
          <button aria-label="Refresh" className={ghost} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="flex border-b border-[#E8E1D6] gap-4 text-xs font-mono overflow-x-auto">
        {tabBtn('overview', <Workflow className="h-3.5 w-3.5" />, 'Status')}
        {tabBtn('webform', <FileText className="h-3.5 w-3.5" />, 'Web form')}
        {tabBtn('whatsapp', <MessageSquare className="h-3.5 w-3.5" />, `WhatsApp (${conversations.length})`)}
        {tabBtn('stripe', <CreditCard className="h-3.5 w-3.5" />, `Stripe (${payments.length})`)}
        {tabBtn('gcal', <Calendar className="h-3.5 w-3.5" />, `Google Calendar (${appointments.length})`)}
        {tabBtn('telegram', <Send className="h-3.5 w-3.5" />, 'Telegram')}
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="text-[11px] text-[#78716A]">Some panels could not load: {Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {providerCard({
            icon: <MessageSquare className="h-5 w-5" />, title: 'WhatsApp (Vonage)', subtitle: 'Messages in, replies out, delivery receipts',
            badge: statusBadge(whatsapp?.status),
            lines: [whatsapp?.whatsappNumber ? `Number +${whatsapp.whatsappNumber}` : 'Number not connected', `Last worked: ${whatsapp?.lastWorkedAt ? new Date(whatsapp.lastWorkedAt).toLocaleString() : 'never'}`],
            onOpen: () => setTab('whatsapp'),
          })}
          {providerCard({
            icon: <CreditCard className="h-5 w-5" />, title: 'Stripe (test mode)', subtitle: 'Payment links and verified webhooks',
            badge: canManage ? statusBadge(stripe?.status) : <Badge state="ok" text="IN USE" />,
            lines: [`${payments.filter((p) => p.status === 'PAID').length} paid · ${payments.filter((p) => p.status === 'PENDING').length} pending`, `Last worked: ${stripe?.lastWorkedAt ? new Date(stripe.lastWorkedAt).toLocaleString() : canManage ? 'never' : '—'}`],
            onOpen: () => setTab('stripe'),
          })}
          {providerCard({
            icon: <Calendar className="h-5 w-5" />, title: 'Google Calendar', subtitle: 'Your own calendar via Google sign-in',
            badge: statusBadge(calendar?.me.status),
            lines: [calendar?.me.email ? `Signed in as ${calendar.me.email}` : 'Not connected for you', `${appointments.length} upcoming appointment(s)`],
            onOpen: () => setTab('gcal'),
          })}
          {providerCard({
            icon: <Send className="h-5 w-5" />, title: 'Telegram alerts', subtitle: 'Escalated leads alert the new owner',
            badge: telegramLinked ? <Badge state="ok" text="LINKED" /> : <Badge state="warn" text="NOT LINKED" />,
            lines: [telegramLinked ? 'Your escalation alerts go to your Telegram' : 'Link your Telegram to receive alerts', canManage ? `${sentAlerts} alert(s) delivered recently` : ''],
            onOpen: () => setTab('telegram'),
          })}
        </div>
      )}

      {/* ---------------- WEB FORM ---------------- */}
      {tab === 'webform' && (() => {
        const base = `${window.location.origin}${window.location.pathname}`;
        const link = formKey ? `${base}?form=${formKey}` : '';
        const embed = formKey ? `<iframe src="${base}?form=${formKey}&embed=1" width="100%" height="640" style="border:0" title="Contact us"></iframe>` : '';
        const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => showToast('success', 'Copied', `${what} copied to the clipboard`));
        return (
          <div className="space-y-4 max-w-3xl">
            <div className={`${card} p-5 space-y-3`}>
              <h3 className="text-base font-bold text-[#2B2A27]">Customer enquiry form</h3>
              <p className="text-xs text-[#78716A]">Share this link (website, social media, QR code on a flyer). Every submission becomes a lead that is assigned immediately and starts its countdown.</p>
              {!formKey ? <div className="text-xs text-[#78716A]">Loading…</div> : (
                <>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6]">
                    <span className="text-xs text-[#2B2A27] truncate flex-1">{link}</span>
                    <button aria-label="Copy form link" className={ghost} onClick={() => copy(link, 'Form link')}><Copy className="h-3.5 w-3.5" /></button>
                    <a className={btn} href={link} target="_blank" rel="noreferrer">Open form <ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                  <div className="text-[11px] text-[#78716A]">Anyone with the link can only submit an enquiry; it gives no access to your data. Spam is filtered and limited to 10 submissions per minute per visitor.</div>
                </>
              )}
            </div>
            {formKey && (
              <div className={`${card} p-5 space-y-3`}>
                <h3 className="text-base font-bold text-[#2B2A27]">Embed on your website</h3>
                <p className="text-xs text-[#78716A]">Paste this into any page of the company website to show the form there.</p>
                <pre className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[11px] text-[#2B2A27] whitespace-pre-wrap break-all">{embed}</pre>
                <button className={ghost} onClick={() => copy(embed, 'Embed code')}><Copy className="h-3.5 w-3.5" /> Copy embed code</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ---------------- WHATSAPP ---------------- */}
      {tab === 'whatsapp' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">{statusBadge(whatsapp?.status)}<span className="text-xs text-[#78716A]">{whatsapp?.configuredOnServer ? 'Credentials present on the server' : 'Vonage credentials are not configured on the server yet'}</span></div>
            {canManage && whatsapp?.configuredOnServer && whatsapp.status !== 'connected' && (
              <button className={btn} disabled={busy} onClick={() => void act(liveApi.whatsappConnect, 'WhatsApp number connected to this workspace')}>Connect number</button>
            )}
          </div>
          {recentErrors(whatsapp)}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`${card} p-3 space-y-2 lg:col-span-1`}>
              <div className="text-[11px] font-mono text-[#78716A] uppercase px-1">Conversations</div>
              {conversations.length === 0 && <div className="text-xs text-[#78716A] px-1">No conversations yet. A WhatsApp message from a new number creates a contact and a lead.</div>}
              {conversations.map((c) => (
                <button key={c.contactId} onClick={() => setOpenContact(c.contactId)} className={`w-full text-left p-2.5 rounded-lg border ${openContact === c.contactId ? 'border-[#4F7F6D]/50 bg-[#FAF8F4]' : 'border-[#E8E1D6] bg-[#FAF8F4]/50 hover:border-[#4F7F6D]/30'}`}>
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#2B2A27]">{c.name}</span>{c.optedOut && <span className="text-[9px] font-mono text-[#B9524C]">OPTED OUT</span>}</div>
                  <div className="text-[10px] text-[#78716A] truncate">{c.lastMessage ? `${c.lastMessage.direction === 'INBOUND' ? '←' : '→'} ${c.lastMessage.body}` : ''}</div>
                  <div className="text-[10px] font-mono text-[#78716A]">Assigned: {c.assignedEmployee?.name ?? '—'}</div>
                </button>
              ))}
            </div>
            <div className={`${card} p-4 lg:col-span-2 space-y-3 min-h-[320px]`}>
              {!thread ? (
                <div className="text-xs text-[#78716A]">Choose a conversation.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div><div className="text-sm font-bold text-[#2B2A27]">{thread.contact.name}</div><div className="text-[11px] font-mono text-[#78716A]">{thread.contact.phone} · assigned to {thread.assignedEmployee?.name ?? '—'}</div></div>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {thread.messages.map((m) => (
                      <div key={m.id} className={`p-2.5 rounded-lg border text-xs max-w-[85%] ${m.direction === 'OUTBOUND' ? 'ml-auto bg-[#FAF8F4] border-[#E8E1D6]' : 'bg-[#F3EEE6] border-[#4F7F6D]/30'}`}>
                        <p className="text-[#2B2A27] whitespace-pre-wrap">{m.body}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono text-[#78716A]">
                          <span>{new Date(m.at).toLocaleTimeString()}</span>
                          <span className={m.status === 'FAILED' ? 'text-[#B9524C]' : m.status === 'READ' || m.status === 'DELIVERED' ? 'text-[#4F7F6D]' : ''}>{m.status}</span>
                        </div>
                        {m.error && <div className="text-[10px] text-[#B9524C] mt-0.5">{m.error}</div>}
                        {m.canRetry && <button className={`${ghost} mt-1`} disabled={busy} onClick={() => void act(() => liveApi.retryWhatsApp(m.id), 'Retried').then(() => loadThread(thread.contact.id))}>Retry</button>}
                      </div>
                    ))}
                  </div>
                  {thread.canSend ? (
                    hasPermission('message:send') && (
                      <div className="flex gap-2">
                        <label htmlFor="wa-reply" className="sr-only">Reply</label>
                        <input id="wa-reply" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendReply()} placeholder="Type a reply…" className={inputCls} />
                        <button className={btn} disabled={busy || !reply.trim()} onClick={() => void sendReply()}>Send</button>
                      </div>
                    )
                  ) : (
                    <div className="p-2.5 rounded-lg bg-[#B9524C]/10 border border-[#B9524C]/30 text-xs text-[#B9524C]">{thread.cannotSendReason}</div>
                  )}
                </>
              )}
            </div>
          </div>
          {limits(whatsapp?.limits)}
        </div>
      )}

      {/* ---------------- STRIPE ---------------- */}
      {tab === 'stripe' && (
        <div className="space-y-4">
          {canManage && <div className="flex items-center gap-2">{statusBadge(stripe?.status)}<span className="text-xs text-[#78716A]">Last worked: {stripe?.lastWorkedAt ? new Date(stripe.lastWorkedAt).toLocaleString() : 'never'}</span></div>}
          <div className="text-xs text-[#78716A]">Create payment links from a deal in the CRM (open a deal → “Create payment link”). Statuses below change by themselves when Stripe’s signed webhook arrives.</div>
          {recentErrors(stripe)}
          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF8F4] border-b border-[#E8E1D6] text-[#78716A] font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">Amount</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Deal / contact</th><th className="py-3 px-4">Requested by</th><th className="py-3 px-4">Stripe reference</th><th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E1D6]">
                  {payments.length === 0 && <tr><td colSpan={6} className="py-4 px-4 text-[#78716A]">No payments yet.</td></tr>}
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F3EEE6]/50">
                      <td className="py-3 px-4 font-mono text-[#2B2A27]">{money(p.amount, p.currency)}{p.refundedAmount ? <div className="text-[10px] text-[#B97F2E]">refunded {money(p.refundedAmount, p.currency)}</div> : null}</td>
                      <td className="py-3 px-4"><Badge state={p.status === 'PAID' ? 'ok' : p.status === 'PENDING' || p.status.includes('REFUND') ? 'warn' : 'bad'} text={p.status} />{p.failureReason && <div className="text-[10px] text-[#B9524C] mt-0.5">{p.failureReason}</div>}</td>
                      <td className="py-3 px-4 text-[#78716A]">{p.opportunity?.title ?? '—'}<div className="text-[10px]">{p.contact?.name ?? ''}</div></td>
                      <td className="py-3 px-4 text-[#78716A]">{p.requestedBy?.name ?? '—'}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-[#78716A]">{p.providerReference.slice(0, 18)}…{p.checkoutUrl && <div><a className="text-[#4F7F6D] underline inline-flex items-center gap-1" href={p.checkoutUrl} target="_blank" rel="noreferrer">checkout <ExternalLink className="h-3 w-3" /></a></div>}</td>
                      <td className="py-3 px-4 font-mono text-[#78716A]">{new Date(p.paidAt ?? p.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {limits(stripe?.limits)}
        </div>
      )}

      {/* ---------------- GOOGLE CALENDAR ---------------- */}
      {tab === 'gcal' && (
        <div className="space-y-4">
          <div className={`${card} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">{statusBadge(calendar?.me.status)}<span className="text-sm font-semibold text-[#2B2A27]">Your Google Calendar</span></div>
              <div className="text-xs text-[#78716A]">{calendar?.me.email ? `Connected as ${calendar.me.email}` : 'Connect to be bookable and to book appointments.'}</div>
              {calendar?.me.problem && calendar.me.status !== 'NOT_CONNECTED' && <div className="text-xs text-[#B9524C]">{calendar.me.problem}</div>}
            </div>
            <div className="flex gap-2">
              {calendar?.me.status !== 'CONNECTED' ? (
                <button className={btn} onClick={() => void connectGoogle()}>{calendar?.me.status === 'ERROR' ? 'Reconnect Google' : 'Connect Google'}</button>
              ) : (
                <button className={ghost} disabled={busy} onClick={() => void act(liveApi.calendarDisconnect, 'Google Calendar disconnected')}>Disconnect</button>
              )}
            </div>
          </div>
          {calendar?.team && (
            <div className={`${card} p-4 space-y-2`}>
              <div className="text-[11px] font-mono text-[#78716A] uppercase">Team calendar connections</div>
              {calendar.team.map((m) => (
                <div key={m.userId} className="flex items-center justify-between text-xs">
                  <span className="text-[#2B2A27]">{m.name}</span>
                  <span className="flex items-center gap-2">{m.email && <span className="text-[#78716A] font-mono text-[10px]">{m.email}</span>}{statusBadge(m.status)}</span>
                </div>
              ))}
            </div>
          )}
          <div className={`${card} p-4 space-y-2`}>
            <div className="text-[11px] font-mono text-[#78716A] uppercase">Upcoming appointments</div>
            <div className="text-[11px] text-[#78716A]">Book from a deal in the CRM. Reschedule or cancel here; Google is updated too.</div>
            {appointments.length === 0 && <div className="text-xs text-[#78716A]">None scheduled.</div>}
            {appointments.map((a) => (
              <div key={a.id} className="p-3 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-[#2B2A27]">{a.title}</div>
                  <div className="font-mono text-[11px] text-[#78716A]">{a.localStart} ({a.timezone}) · {nameOf(a.assignedUserId)} · {a.status}</div>
                </div>
                {hasPermission('appointment:create') && (
                  <div className="flex gap-2">
                    <button className={ghost} disabled={busy} onClick={() => {
                      const start = new Date(new Date(a.startTime).getTime() + 3600e3);
                      const end = new Date(new Date(a.endTime).getTime() + 3600e3);
                      void act(() => liveApi.rescheduleAppointment(a.id, start.toISOString(), end.toISOString()), 'Moved 1 hour later', 'Google Calendar updated.');
                    }}>+1 hour</button>
                    <button className={ghost} disabled={busy} onClick={() => void act(() => liveApi.cancelAppointment(a.id), 'Appointment cancelled', 'Removed from Google Calendar.')}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {limits(calendar?.limits)}
        </div>
      )}

      {/* ---------------- TELEGRAM ---------------- */}
      {tab === 'telegram' && (
        <div className="space-y-4 max-w-3xl">
          <div className={`${card} p-5 space-y-3`}>
            <div className="flex items-center gap-2">
              {telegramLinked ? <CheckCircle2 className="h-5 w-5 text-[#4F7F6D]" /> : <AlertTriangle className="h-5 w-5 text-[#B97F2E]" />}
              <h3 className="text-base font-bold text-[#2B2A27]">{telegramLinked ? 'Telegram is linked — your escalation alerts arrive in Telegram' : 'Link your Telegram'}</h3>
            </div>
            <p className="text-xs text-[#78716A]">When a lead escalates to you, the bot sends the lead name, source, reason and a link that opens the lead.</p>
            {!telegramLinked && <p className="text-xs text-[#78716A]">Open the bot in Telegram and press Start, then click “Link my Telegram”.</p>}
            <div className="flex gap-2">
              {!telegramLinked && <button className={btn} disabled={busy} onClick={() => void act(liveApi.telegramLink, 'Telegram linked', 'A confirmation was sent to your chat.')}>Link my Telegram</button>}
              {telegramLinked && <button className={btn} disabled={busy} onClick={() => void act(liveApi.telegramTest, 'Test alert sent', 'Check your Telegram.')}>Send test alert</button>}
            </div>
          </div>
          {canManage && (
            <div className={`${card} p-4 space-y-2`}>
              <div className="text-[11px] font-mono text-[#78716A] uppercase">Team alert routing</div>
              {team.map((m) => (
                <div key={m.userId} className="flex items-center justify-between text-xs"><span className="text-[#2B2A27]">{m.name}</span>{m.telegramConfigured ? <Badge state="ok" text="LINKED" /> : <Badge state="warn" text="NOT LINKED" />}</div>
              ))}
            </div>
          )}
          {canManage && (
            <div className={`${card} p-4 space-y-2`}>
              <div className="text-[11px] font-mono text-[#78716A] uppercase">Recent escalation alerts (delivery log)</div>
              {alerts.length === 0 && <div className="text-xs text-[#78716A]">No alerts yet.</div>}
              {alerts.slice(0, 15).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#78716A] font-mono">{new Date(a.createdAt).toLocaleString()} → {nameOf(a.recipientUserId)}</span>
                  <span className="flex items-center gap-2">
                    {a.lastError && a.status !== 'SENT' && <span className="text-[#B9524C] truncate max-w-[220px]" title={a.lastError}>{a.lastError}</span>}
                    <Badge state={a.status === 'SENT' ? 'ok' : a.status === 'PENDING' ? 'warn' : 'bad'} text={`${a.status}${a.attempts > 1 ? ` · ${a.attempts} tries` : ''}`} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
