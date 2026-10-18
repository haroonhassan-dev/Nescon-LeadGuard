import React, { useState } from 'react';
import {
  Workflow,
  MessageSquare,
  CreditCard,
  Calendar,
  Send,
  Clock,
  AlertTriangle,
  Info
} from 'lucide-react';
import { Payment } from '@shared/payment';
import { Message } from '@shared/message';
import { Appointment } from '@shared/appointment';
import { User } from '@shared/user';
import { useToast } from '../context/ToastContext';

interface IntegrationsPageProps {
  payments: Payment[];
  messages: Message[];
  appointments: Appointment[];
  users: User[];
  isBackendHealthy: boolean | null;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  payments,
  messages,
  appointments,
  users,
  isBackendHealthy,
}) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'twilio' | 'stripe' | 'gcal' | 'telegram'>('overview');

  // Twilio SMS Simulator State
  const [smsRecipient, setSmsRecipient] = useState('+15552349988');
  const [smsBody, setSmsBody] = useState('');

  // Stripe Test Checkout State
  const [stripeAmount, setStripeAmount] = useState(3500);
  const [stripeEmail, setStripeEmail] = useState('client@example.com');
  const [stripeDesc, setStripeDesc] = useState('Emergency Service Retainer Deposit');

  // Google Calendar Consultation Booking State
  const [gcalTitle, setGcalTitle] = useState('Hospital Cleanroom Air Filter Diagnostic');
  const [gcalDate, setGcalDate] = useState('2026-10-22T14:00');
  const [gcalUser, setGcalUser] = useState(users[0]?.id || '');

  // Telegram Alert State
  const [telegramChatId, setTelegramChatId] = useState('849302194');
  const [telegramAlertText, setTelegramAlertText] = useState('SLA ALERT: Zone 3 Water Main Rupture escalated to Level 1. Immediate manager action required.');

  // Guarded actions - honest disclosure (Priority 5: Do not represent simulated integrations as real successes)
  const handleUnavailableAction = (e: React.FormEvent, integrationName: string) => {
    e.preventDefault();
    showToast(
      'warning',
      `${integrationName} Unavailable`,
      `The ${integrationName} endpoint is pending third-party backend implementation. Simulated events are blocked from fabricating live records.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#242E30] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7F2]">
              Third-Party Integrations Hub
            </h1>
            <span className="text-[10px] font-mono tracking-widest uppercase bg-[#F5A623]/10 border border-[#F5A623]/30 text-[#F5A623] px-2 py-0.5 rounded">
              PENDING 3RD-PARTY ADAPTERS
            </span>
          </div>
          <p className="text-xs text-[#8E9B9A] mt-0.5">
            External partner adapters status, verified webhook contracts, and integration audit disclosures
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0D1112] border border-[#242E30] px-3 py-1.5 rounded-lg text-xs font-mono">
          <span className="text-[#8E9B9A]">Express API Gateway:</span>
          <span className={`font-semibold ${isBackendHealthy ? 'text-[#B7F45B]' : 'text-[#F5A623]'}`}>
            {isBackendHealthy ? 'ONLINE (:4000)' : 'STANDALONE'}
          </span>
        </div>
      </div>

      {/* Honest Status Notice Banner */}
      <div className="p-4 rounded-xl bg-[#171E1F] border border-[#F5A623]/40 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[#F5A623] shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-bold text-[#F5F7F2]">
            Integration Status Notice: External Partner Adapters Pending
          </div>
          <p className="text-[#8E9B9A] leading-relaxed">
            While core P0 services (Auth, Multi-Tenant Isolation, Lead Assignment Engine, Escalation Workers, and Audit Logs)
            are fully connected to the backend on <span className="font-mono text-[#F5F7F2]">feat/backend</span>, third-party adapters
            (Twilio, Stripe, Google Calendar, and Telegram) were assigned to the third teammate branch (<span className="font-mono text-[#F5F7F2]">feat/testing</span>).
            In compliance with hackathon rules, simulation actions are disabled to prevent generating fabricated data.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#242E30] gap-4 text-xs font-mono">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Workflow className="h-3.5 w-3.5" />
          <span>Status Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('twilio')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'twilio'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Twilio SMS ({messages.filter((m) => m.channel === 'TWILIO_SMS').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('stripe')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'stripe'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>Stripe Test Mode ({payments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('gcal')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'gcal'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>Google Calendar ({appointments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('telegram')}
          className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'telegram'
              ? 'border-[#B7F45B] text-[#B7F45B]'
              : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          <span>Telegram Alerts</span>
        </button>
      </div>

      {/* OVERVIEW STATUS DASHBOARD */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Twilio */}
            <div className="p-5 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#F5A623]">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30">
                  ADAPTER PENDING
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Twilio SMS</h3>
                <p className="text-xs text-[#8E9B9A]">Inbound webhook & transactional dispatch</p>
              </div>
              <div className="text-[11px] font-mono text-[#8E9B9A] border-t border-[#242E30] pt-2">
                <div>HMAC Signature: X-Twilio-Signature</div>
                <div className="text-[#F5A623] mt-0.5">Status: Pending Backend Worker</div>
              </div>
            </div>

            {/* Stripe */}
            <div className="p-5 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#F5A623]">
                  <CreditCard className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30">
                  GATEWAY PENDING
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Stripe Payments</h3>
                <p className="text-xs text-[#8E9B9A]">Test checkout sessions & retainer deposits</p>
              </div>
              <div className="text-[11px] font-mono text-[#8E9B9A] border-t border-[#242E30] pt-2">
                <div>Constraint: livemode === false</div>
                <div className="text-[#F5A623] mt-0.5">Status: Awaiting Gateway Handler</div>
              </div>
            </div>

            {/* Google Calendar */}
            <div className="p-5 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#F5A623]">
                  <Calendar className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30">
                  OAUTH PENDING
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Google Calendar</h3>
                <p className="text-xs text-[#8E9B9A]">Technician dispatch & client consultations</p>
              </div>
              <div className="text-[11px] font-mono text-[#8E9B9A] border-t border-[#242E30] pt-2">
                <div>OAuth Callback: /oauth2callback</div>
                <div className="text-[#F5A623] mt-0.5">Status: Pending OAuth Setup</div>
              </div>
            </div>

            {/* Telegram */}
            <div className="p-5 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#F5A623]">
                  <Send className="h-5 w-5" />
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/30">
                  BOT UNCONFIGURED
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F7F2]">Telegram Bot</h3>
                <p className="text-xs text-[#8E9B9A]">SLA escalation alerts to manager chats</p>
              </div>
              <div className="text-[11px] font-mono text-[#8E9B9A] border-t border-[#242E30] pt-2">
                <div>Outbox Worker: Pending Sender</div>
                <div className="text-[#F5A623] mt-0.5">Status: Awaiting Bot Token</div>
              </div>
            </div>
          </div>

          {/* Webhook Architecture Specification */}
          <div className="p-4 rounded-xl bg-[#0D1112] border border-[#242E30] flex items-start gap-3">
            <Info className="h-5 w-5 text-[#B7F45B] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-semibold text-[#F5F7F2]">
                Architectural Contract Requirements
              </div>
              <p className="text-[#8E9B9A] leading-relaxed">
                When external partner adapters are registered in <span className="font-mono text-[#F5F7F2]">server/src/integrations/</span>,
                they will hook directly into the backend transactional outbox with raw-body cryptographic signature verification.
                Until then, client actions are protected against fabricating mock event payloads.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TWILIO SMS TAB */}
      {activeTab === 'twilio' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F5F7F2]">Outbound SMS Dispatcher</h3>
              <span className="text-[10px] font-mono text-[#F5A623] bg-[#0D1112] border border-[#242E30] px-2 py-0.5 rounded">
                ADAPTER UNAVAILABLE
              </span>
            </div>

            <form onSubmit={(e) => handleUnavailableAction(e, 'Twilio SMS')} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Recipient Phone (E.164)
                </label>
                <input
                  type="text"
                  disabled
                  value={smsRecipient}
                  onChange={(e) => setSmsRecipient(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  SMS Message Body
                </label>
                <textarea
                  rows={4}
                  disabled
                  placeholder="Dispatch disabled until Twilio backend adapter is wired."
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#242E30] text-[#8E9B9A] cursor-not-allowed font-semibold text-xs uppercase tracking-wide transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Action Unavailable — Awaiting Twilio Adapter
              </button>
            </form>
          </div>

          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F5F7F2]">Historical Inbound Sample Data</h3>
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {messages
                .filter((m) => m.channel === 'TWILIO_SMS')
                .map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      msg.direction === 'OUTBOUND'
                        ? 'bg-[#0D1112] border-[#242E30] ml-6'
                        : 'bg-[#1F282A] border-[#B7F45B]/30 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#8E9B9A]">
                      <span className="font-semibold text-[#B7F45B]">
                        {msg.direction === 'OUTBOUND' ? 'Sent (LeadGuard)' : `Inbound (${msg.sender})`}
                      </span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[#F5F7F2] leading-snug">{msg.body}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* STRIPE TAB */}
      {activeTab === 'stripe' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F5F7F2]">Stripe Retainer Checkout</h3>
              <span className="text-[10px] font-mono text-[#F5A623] bg-[#0D1112] border border-[#242E30] px-2 py-0.5 rounded">
                GATEWAY UNAVAILABLE
              </span>
            </div>

            <form onSubmit={(e) => handleUnavailableAction(e, 'Stripe Payment')} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Customer Email
                </label>
                <input
                  type="email"
                  disabled
                  value={stripeEmail}
                  onChange={(e) => setStripeEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Retainer Deposit Amount ($ USD)
                </label>
                <input
                  type="number"
                  disabled
                  value={stripeAmount}
                  onChange={(e) => setStripeAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Contract / Service Scope
                </label>
                <input
                  type="text"
                  disabled
                  value={stripeDesc}
                  onChange={(e) => setStripeDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#242E30] text-[#8E9B9A] cursor-not-allowed font-semibold text-xs uppercase tracking-wide transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Action Unavailable — Awaiting Stripe Gateway
              </button>
            </form>
          </div>

          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F5F7F2]">Stripe Historical Sample Receipts</h3>
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-lg bg-[#0D1112] border border-[#242E30] space-y-2 text-xs font-mono"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#F5F7F2]">
                      ${(p.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30">
                      {p.status}
                    </span>
                  </div>
                  <div className="text-[#8E9B9A] text-[11px] font-sans">{p.description}</div>
                  <div className="pt-2 border-t border-[#242E30] flex items-center justify-between text-[10px] text-[#8E9B9A]">
                    <span>PI: {p.stripePaymentIntentId}</span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE CALENDAR TAB */}
      {activeTab === 'gcal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F5F7F2]">Book On-Site Consultation</h3>

            <form onSubmit={(e) => handleUnavailableAction(e, 'Google Calendar')} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Appointment Title
                </label>
                <input
                  type="text"
                  disabled
                  value={gcalTitle}
                  onChange={(e) => setGcalTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Date & Start Time
                </label>
                <input
                  type="datetime-local"
                  disabled
                  value={gcalDate}
                  onChange={(e) => setGcalDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                  Assigned Service Technician
                </label>
                <select
                  disabled
                  value={gcalUser}
                  onChange={(e) => setGcalUser(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.role?.type})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#242E30] text-[#8E9B9A] cursor-not-allowed font-semibold text-xs uppercase tracking-wide transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                Action Unavailable — Awaiting Calendar OAuth
              </button>
            </form>
          </div>

          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-[#F5F7F2]">Calendar Appointment Records</h3>
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="p-3.5 rounded-lg bg-[#0D1112] border border-[#242E30] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#F5F7F2]">{apt.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30">
                      {apt.status}
                    </span>
                  </div>
                  <div className="text-[#8E9B9A] flex items-center gap-2 font-mono text-[11px]">
                    <Clock className="h-3.5 w-3.5 text-[#B7F45B]" />
                    <span>{new Date(apt.startTime).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TELEGRAM TAB */}
      {activeTab === 'telegram' && (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 space-y-5 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-[#F5F7F2]">Telegram Escalation Channel</h3>
            <p className="text-xs text-[#8E9B9A] mt-0.5">
              Automated manager alert broadcasts require registered bot webhook credentials
            </p>
          </div>

          <form onSubmit={(e) => handleUnavailableAction(e, 'Telegram Bot')} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Target Telegram Chat ID
              </label>
              <input
                type="text"
                disabled
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Escalation Alert Template
              </label>
              <textarea
                rows={3}
                disabled
                value={telegramAlertText}
                onChange={(e) => setTelegramAlertText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] text-xs cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#242E30] text-[#8E9B9A] cursor-not-allowed font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Send className="h-4 w-4" />
              Action Unavailable — Awaiting Telegram Bot Setup
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
