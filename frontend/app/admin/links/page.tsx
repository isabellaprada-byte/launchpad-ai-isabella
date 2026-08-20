'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface BiginContact {
  id: string;
  name: string;
  email: string;
  company: string;
  planType?: 'conversion' | 'startup' | null;
}

interface SponsorLink {
  id: string;
  token: string;
  sponsor_name: string;
  sponsor_email: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_count: number;
  last_used_at: string | null;
}

const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isExpired(iso: string) {
  return new Date(iso) < new Date();
}

export default function AdminLinksPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [contacts, setContacts] = useState<BiginContact[]>([]);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<BiginContact | null>(null);

  // Manual override if contact not in Bigin
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const [createdBy, setCreatedBy] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newLink, setNewLink] = useState<{ link: string; sponsorName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [links, setLinks] = useState<SponsorLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const res = await fetch('/api/admin/links');
      const data = await res.json() as { links: SponsorLink[] };
      setLinks(data.links ?? []);
    } finally {
      setLinksLoading(false);
    }
  }, []);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  async function handleSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError('');
    setContacts([]);
    setSelected(null);
    try {
      const res = await fetch(`/api/admin/bigin-search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json() as { contacts?: BiginContact[]; error?: string };
      if (!res.ok) { setSearchError(data.error ?? 'Search failed'); return; }
      setContacts(data.contacts ?? []);
      if ((data.contacts ?? []).length === 0) setSearchError('No contacts found. You can enter details manually below.');
    } catch {
      setSearchError('Search failed — check your connection.');
    } finally {
      setSearching(false);
    }
  }

  // sponsorName = company name (what gets locked on the upload form)
  // fall back to contact name if no company linked
  const activeName  = selected ? (selected.company || selected.name) : manualName;
  const activeEmail = selected ? selected.email : manualEmail;

  async function handleCreate() {
    if (!activeName.trim() || !activeEmail.trim() || !createdBy.trim()) return;
    setCreating(true);
    setCreateError('');
    setNewLink(null);
    try {
      const res = await fetch('/api/admin/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorName: activeName.trim(),
          sponsorEmail: activeEmail.trim(),
          createdBy: createdBy.trim(),
          sendEmail,
          contactName: selected?.name ?? undefined,
        }),
      });
      const data = await res.json() as { link?: string; error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create link'); return; }
      // Append contact name + plan type to link so the welcome page personalizes
      const extra = new URLSearchParams();
      if (selected?.name) extra.set('contact', selected.name);
      if (selected?.planType) extra.set('planType', selected.planType);
      const extraStr = extra.toString() ? '?' + extra.toString() : '';
      setNewLink({ link: data.link! + extraStr, sponsorName: activeName.trim() });
      setQuery(''); setContacts([]); setSelected(null); setManualName(''); setManualEmail('');
      loadLinks();
    } catch {
      setCreateError('Failed to create link — check your connection.');
    } finally {
      setCreating(false);
    }
  }

  function copyLink(link: string, token?: string) {
    const text = link;
    const fallback = () => {
      const el = document.createElement('textarea');
      el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else { fallback(); }
    if (token) {
      setCopiedToken(token); setTimeout(() => setCopiedToken(null), 2500);
    } else {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    }
  }

  const canCreate = activeName.trim() && activeEmail.trim() && createdBy.trim();

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sponsor Upload Links</h1>
        <p className="text-slate-500 text-sm mt-1">Generate a unique upload link for each sponsor and send it via email.</p>
      </div>

      {/* Create new link */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-800">Create a new link</h2>

        {/* Bigin search */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Search sponsor in Bigin</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Company or contact name..."
              className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button onClick={handleSearch} disabled={searching || query.trim().length < 2} className="rounded-xl">
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {searchError && <p className="text-sm text-slate-500">{searchError}</p>}
          {contacts.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {contacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors ${selected?.id === c.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.company && <span className="text-slate-400 ml-2">· {c.company}</span>}
                    <div className="text-slate-400 text-xs mt-0.5">{c.email}</div>
                  </div>
                  {selected?.id === c.id && (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manual entry */}
        {!selected && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Or enter manually</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Company / Sponsor name</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Sponsor email</label>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder="hr@acmecorp.com"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Selected summary */}
        {selected && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-blue-500 font-medium uppercase tracking-wide">Email to:</span>
                  <span className="font-medium text-blue-800">{selected.name}</span>
                  <span className="text-blue-400 text-xs">({selected.email})</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-blue-500 font-medium uppercase tracking-wide">Sponsor name:</span>
                  <span className="font-semibold text-blue-900">{selected.company || selected.name}</span>
                  <span className="text-xs text-blue-400">(locked on upload form)</span>
                  {selected.planType && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${selected.planType === 'conversion' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {selected.planType === 'conversion' ? 'Conversion' : 'Start-Up'}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-blue-400 hover:text-blue-600 text-xs underline shrink-0">Clear</button>
            </div>
          </div>
        )}

        {/* Created by + send email */}
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Created by</label>
            <input
              type="text"
              value={createdBy}
              onChange={e => setCreatedBy(e.target.value)}
              placeholder="Isabella or Kevin"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-1">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-slate-700">Send link via email</span>
          </label>
        </div>

        {createError && <p className="text-sm text-red-500">{createError}</p>}

        <Button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className="w-full rounded-xl h-11"
        >
          {creating ? 'Creating…' : 'Generate & send link'}
        </Button>

        {/* Success */}
        {newLink && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">Link created for {newLink.sponsorName}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-slate-700 truncate">{newLink.link}</code>
              <button
                onClick={() => copyLink(newLink.link)}
                className="shrink-0 text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 rounded-lg px-3 py-2 hover:bg-green-100 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing links */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">All sponsor links</h2>
          <button onClick={loadLinks} className="text-xs text-slate-400 hover:text-slate-600 underline">Refresh</button>
        </div>

        {linksLoading && <p className="text-sm text-slate-400">Loading…</p>}

        {!linksLoading && links.length === 0 && (
          <p className="text-sm text-slate-400">No links created yet.</p>
        )}

        {!linksLoading && links.length > 0 && (
          <div className="space-y-2">
            {links.map(link => {
              const expired = isExpired(link.expires_at);
              const uploadLink = `${APP_URL}/upload/${link.token}`;
              return (
                <div key={link.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${expired ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 text-sm">{link.sponsor_name}</span>
                      {expired && <span className="text-xs bg-slate-100 text-slate-400 rounded-full px-2 py-0.5">Expired</span>}
                      {!expired && link.used_count > 0 && <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">Used {link.used_count}×</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {link.sponsor_email} · Created {formatDate(link.created_at)} by {link.created_by}
                      {!expired && ` · Expires ${formatDate(link.expires_at)}`}
                    </div>
                  </div>
                  {!expired && (
                    <button
                      onClick={() => copyLink(uploadLink, link.token)}
                      className="shrink-0 text-xs text-slate-500 hover:text-slate-700 font-medium border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      {copiedToken === link.token ? '✓ Copied' : 'Copy link'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
