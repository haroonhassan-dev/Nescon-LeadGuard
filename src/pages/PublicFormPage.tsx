import React, { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { BackgroundDecor } from '../components/common/BackgroundDecor';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const inputCls =
  'w-full px-3.5 py-2.5 rounded-lg bg-white border border-[#E8E1D6] text-[#2B2A27] text-sm focus:outline-none focus:border-[#4F7F6D]';

/**
 * Public enquiry form (F3.1, source WEB_FORM). No login: the workspace is identified by its
 * unguessable form key in the link. Submitting creates a lead that is assigned at once.
 * Embedded mode (?embed=1) drops the page chrome so it fits inside a company's own website.
 */
export const PublicFormPage: React.FC<{ formKey: string; embedded?: boolean }> = ({ formKey, embedded }) => {
  const [company, setCompany] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/public/forms/${encodeURIComponent(formKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = await r.json();
        setCompany(body.data.companyName);
        document.title = `Contact ${body.data.companyName}`;
      })
      .catch(() => setNotFound(true));
  }, [formKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Please give an email address or a phone number so we can reach you.');
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`${API_BASE_URL}/public/forms/${encodeURIComponent(formKey)}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          message: form.message.trim() || undefined,
          website: form.website, // honeypot: real visitors never fill this
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const details = body?.error?.details?.map((d: { message: string }) => d.message).join(' ');
        throw new Error(r.status === 429 ? 'Too many submissions. Please wait a minute and try again.' : details || body?.error?.message || 'Something went wrong.');
      }
      setDone(body?.data?.message ?? 'Thank you! We will contact you shortly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const card = (
    <div className="app-layer page-enter w-full max-w-lg rounded-2xl bg-white/95 border border-[#E8E1D6] p-7 sm:p-9 shadow-[0_24px_60px_-34px_rgba(43,42,39,0.5)]">
      {notFound ? (
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-[#2B2A27]">Form not found</h1>
          <p className="text-sm text-[#78716A]">This link is not valid. Please check it with the company.</p>
        </div>
      ) : done ? (
        <div className="text-center space-y-3 py-6">
          <CheckCircle2 className="h-12 w-12 text-[#4F7F6D] mx-auto" />
          <h1 className="text-2xl font-bold text-[#2B2A27]">Message received</h1>
          <p className="text-sm text-[#78716A]">{done}</p>
          <button onClick={() => { setDone(null); setForm({ name: '', email: '', phone: '', message: '', website: '' }); }} className="text-sm text-[#4F7F6D] underline">
            Send another enquiry
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-widest text-[#4F7F6D]">Get in touch</div>
            <h1 className="text-3xl font-bold text-[#2B2A27] leading-tight">{company ?? '…'}</h1>
            <p className="text-sm text-[#78716A]">Tell us what you need. A member of our team will reply quickly.</p>
          </div>

          <div>
            <label htmlFor="pf-name" className="block text-sm text-[#2B2A27] mb-1">Your name *</label>
            <input id="pf-name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-email" className="block text-sm text-[#2B2A27] mb-1">Email</label>
              <input id="pf-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label htmlFor="pf-phone" className="block text-sm text-[#2B2A27] mb-1">Phone (with country code)</label>
              <input id="pf-phone" type="tel" autoComplete="tel" placeholder="+92 300 1234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="pf-msg" className="block text-sm text-[#2B2A27] mb-1">How can we help?</label>
            <textarea id="pf-msg" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputCls} />
          </div>
          {/* Honeypot: hidden from people and screen readers; bots fill it and get rejected. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
            <label htmlFor="pf-website">Website</label>
            <input id="pf-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>

          {error && <div role="alert" className="p-3 rounded-lg bg-[#B9524C]/10 border border-[#B9524C]/30 text-sm text-[#B9524C]">{error}</div>}

          <button type="submit" disabled={sending || !form.name.trim()} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] disabled:opacity-50 text-white text-sm font-semibold tracking-wide transition-colors">
            <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send enquiry'}
          </button>
          <p className="text-[11px] text-[#78716A] text-center">Email or phone is required so we can reply.</p>
        </form>
      )}
    </div>
  );

  if (embedded) return <div className="p-3 flex justify-center bg-transparent">{card}</div>;
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <BackgroundDecor />
      {card}
    </div>
  );
};
