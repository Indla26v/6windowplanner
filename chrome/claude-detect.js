// Content script on claude.ai: reads the account's weekly reset (and usage %)
// using the session already signed in on this page. Results go only to this
// extension's own storage; nothing is sent anywhere else.
(() => {
  const AUTO_EVERY_MS = 30 * 60 * 1000;

  async function getJSON(path) {
    const res = await fetch(path, { credentials: 'include', headers: { accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) throw new Error('Sign in to claude.ai in this browser, then try again.');
    if (!res.ok) throw new Error(`claude.ai answered ${res.status} for ${path}`);
    return res.json();
  }

  function pickOrg(orgs) {
    if (!Array.isArray(orgs) || !orgs.length) return null;
    const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    const fromCookie = m && orgs.find((o) => o.uuid === decodeURIComponent(m[1]));
    if (fromCookie) return fromCookie;
    const paid = orgs.find((o) => (o.capabilities || []).some((c) => /pro|max/i.test(c)));
    return paid || orgs[0];
  }

  function weeklyFrom(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const w = usage.seven_day || usage.sevenDay || usage.weekly || null;
    if (w && (w.resets_at || w.resetsAt)) {
      return { resetsAt: w.resets_at || w.resetsAt, utilization: Number(w.utilization ?? w.percent ?? NaN) };
    }
    return null;
  }

  // Fallback: read "Resets Fri 6:30 AM"-style text on the usage settings page.
  function weeklyFromPage() {
    const text = document.body ? document.body.innerText : '';
    const idx = text.search(/week/i);
    const scope = idx >= 0 ? text.slice(idx, idx + 600) : text;
    const m = scope.match(/Resets?\s+(?:on\s+)?(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\.?,?\s+(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
    if (!m) return null;
    const days = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    let h = Number(m[2]) % 12;
    if (!m[4]) h = Number(m[2]);
    else if (/p/i.test(m[4])) h += 12;
    const now = new Date();
    const r = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, Number(m[3] || 0));
    r.setDate(r.getDate() + ((days[m[1].toLowerCase()] - r.getDay() + 7) % 7));
    if (r <= now) r.setDate(r.getDate() + 7);
    const pct = scope.match(/(\d{1,3})\s*%\s*used/i);
    return { resetsAt: r.toISOString(), utilization: pct ? Number(pct[1]) : NaN };
  }

  async function detect() {
    let apiError = null;
    try {
      const org = pickOrg(await getJSON('/api/organizations'));
      if (org) {
        const w = weeklyFrom(await getJSON(`/api/organizations/${encodeURIComponent(org.uuid)}/usage`));
        const planHints = [...(org.capabilities || []), org.rate_limit_tier, org.billing_type].filter((x) => typeof x === 'string');
        if (w) return { ...w, planHints, source: 'claude.ai', at: new Date().toISOString() };
      }
    } catch (e) {
      apiError = e;
    }
    const w = weeklyFromPage();
    if (w) return { ...w, source: 'claude.ai', at: new Date().toISOString() };
    throw apiError || new Error('No weekly limit found. Open claude.ai → Settings → Usage and try again.');
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'six-window:detect-now') return false;
    detect()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  });

  // Quiet background refresh while the user is on claude.ai anyway.
  chrome.storage.local.get('sixWindowConfig').then(({ sixWindowConfig: cfg }) => {
    if (!cfg || cfg.autoDetect === false) return;
    const last = cfg.resetDetectedAt ? Date.parse(cfg.resetDetectedAt) : 0;
    if (Date.now() - last < AUTO_EVERY_MS) return;
    detect()
      .then((result) => chrome.runtime.sendMessage({ type: 'six-window:detected', result }))
      .catch(() => { /* stay quiet on background refresh */ });
  });
})();
