// Country presets: locale (date/number format), currency, a default monthly
// Claude Pro price (approximate, always editable) and the time zones used there.
// Other plans scale from the Pro price (see PLANS).
// The first zone is the default when the browser's own zone is not in the list.

export const COUNTRIES = [
  { code: 'IN', name: 'India',          locale: 'en-IN', currency: 'INR', price: 1999,   zones: ['Asia/Kolkata'] },
  { code: 'US', name: 'United States',  locale: 'en-US', currency: 'USD', price: 20,     zones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'] },
  { code: 'GB', name: 'United Kingdom', locale: 'en-GB', currency: 'GBP', price: 18,     zones: ['Europe/London'] },
  { code: 'CA', name: 'Canada',         locale: 'en-CA', currency: 'CAD', price: 28,     zones: ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Halifax', 'America/St_Johns'] },
  { code: 'AU', name: 'Australia',      locale: 'en-AU', currency: 'AUD', price: 30,     zones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Darwin', 'Australia/Hobart'] },
  { code: 'NZ', name: 'New Zealand',    locale: 'en-NZ', currency: 'NZD', price: 33,     zones: ['Pacific/Auckland'] },
  { code: 'IE', name: 'Ireland',        locale: 'en-IE', currency: 'EUR', price: 18,     zones: ['Europe/Dublin'] },
  { code: 'DE', name: 'Germany',        locale: 'de-DE', currency: 'EUR', price: 18,     zones: ['Europe/Berlin'] },
  { code: 'FR', name: 'France',         locale: 'fr-FR', currency: 'EUR', price: 18,     zones: ['Europe/Paris'] },
  { code: 'ES', name: 'Spain',          locale: 'es-ES', currency: 'EUR', price: 18,     zones: ['Europe/Madrid', 'Atlantic/Canary'] },
  { code: 'IT', name: 'Italy',          locale: 'it-IT', currency: 'EUR', price: 18,     zones: ['Europe/Rome'] },
  { code: 'NL', name: 'Netherlands',    locale: 'nl-NL', currency: 'EUR', price: 18,     zones: ['Europe/Amsterdam'] },
  { code: 'SE', name: 'Sweden',         locale: 'sv-SE', currency: 'SEK', price: 230,    zones: ['Europe/Stockholm'] },
  { code: 'CH', name: 'Switzerland',    locale: 'de-CH', currency: 'CHF', price: 18,     zones: ['Europe/Zurich'] },
  { code: 'PL', name: 'Poland',         locale: 'pl-PL', currency: 'PLN', price: 90,     zones: ['Europe/Warsaw'] },
  { code: 'AE', name: 'United Arab Emirates', locale: 'en-AE', currency: 'AED', price: 75, zones: ['Asia/Dubai'] },
  { code: 'SG', name: 'Singapore',      locale: 'en-SG', currency: 'SGD', price: 28,     zones: ['Asia/Singapore'] },
  { code: 'JP', name: 'Japan',          locale: 'ja-JP', currency: 'JPY', price: 3000,   zones: ['Asia/Tokyo'] },
  { code: 'KR', name: 'South Korea',    locale: 'ko-KR', currency: 'KRW', price: 29000,  zones: ['Asia/Seoul'] },
  { code: 'PH', name: 'Philippines',    locale: 'en-PH', currency: 'PHP', price: 1150,   zones: ['Asia/Manila'] },
  { code: 'ID', name: 'Indonesia',      locale: 'id-ID', currency: 'IDR', price: 330000, zones: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] },
  { code: 'PK', name: 'Pakistan',       locale: 'en-PK', currency: 'PKR', price: 5600,   zones: ['Asia/Karachi'] },
  { code: 'BD', name: 'Bangladesh',     locale: 'en-BD', currency: 'BDT', price: 2400,   zones: ['Asia/Dhaka'] },
  { code: 'LK', name: 'Sri Lanka',      locale: 'en-LK', currency: 'LKR', price: 6000,   zones: ['Asia/Colombo'] },
  { code: 'NP', name: 'Nepal',          locale: 'en-NP', currency: 'NPR', price: 2700,   zones: ['Asia/Kathmandu'] },
  { code: 'BR', name: 'Brazil',         locale: 'pt-BR', currency: 'BRL', price: 110,    zones: ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'] },
  { code: 'MX', name: 'Mexico',         locale: 'es-MX', currency: 'MXN', price: 400,    zones: ['America/Mexico_City', 'America/Tijuana', 'America/Cancun'] },
  { code: 'ZA', name: 'South Africa',   locale: 'en-ZA', currency: 'ZAR', price: 380,    zones: ['Africa/Johannesburg'] },
  { code: 'NG', name: 'Nigeria',        locale: 'en-NG', currency: 'NGN', price: 32000,  zones: ['Africa/Lagos'] },
  { code: 'KE', name: 'Kenya',          locale: 'en-KE', currency: 'KES', price: 2600,   zones: ['Africa/Nairobi'] },
];

export const DEFAULT_COUNTRY = 'IN';

// Individual paid plans with a weekly usage limit. mult = monthly price relative to Pro
// (US list prices: Pro $20, Max 5x $100, Max 20x $200). Prices stay editable.
export const PLANS = [
  { id: 'pro', name: 'Pro', mult: 1, usage: 'Standard weekly limit' },
  { id: 'max5', name: 'Max 5x', mult: 5, usage: '5× Pro usage' },
  { id: 'max20', name: 'Max 20x', mult: 10, usage: '20× Pro usage' },
];

export function planById(id) {
  return PLANS.find((p) => p.id === id) || PLANS[0];
}

/** Default monthly price for a plan in a country (rounded to a tidy number). */
export function planPrice(countryCode, planId) {
  const c = countryByCode(countryCode);
  if (planById(planId).mult === 1) return c.price;
  const v = c.price * planById(planId).mult;
  const step = v >= 10000 ? 100 : v >= 1000 ? 10 : 1;
  const rounded = Math.round(v / step) * step;
  // Keep "…99"-style local pricing (₹1,999 → ₹9,999 / ₹19,999).
  return planById(planId).mult > 1 && c.price % 10 === 9 ? rounded - 1 : rounded;
}

/** Best-effort plan id from hints such as "claude_max", "default_claude_max_20x", "pro". */
export function planFromHints(...hints) {
  const t = hints.flat().filter(Boolean).join(' ').toLowerCase();
  if (!t) return null;
  if (/max[_s-]?20x|20x/.test(t)) return 'max20';
  if (/max[_s-]?5x|5x/.test(t)) return 'max5';
  if (/max/.test(t)) return 'max5';
  if (/pro/.test(t)) return 'pro';
  return null;
}

// Legacy zone names some browsers still report → canonical names used above.
export const ZONE_ALIASES = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Ujung_Pandang': 'Asia/Makassar',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Arizona': 'America/Phoenix',
  'US/Pacific': 'America/Los_Angeles',
  'US/Alaska': 'America/Anchorage',
  'US/Hawaii': 'Pacific/Honolulu',
  'Canada/Eastern': 'America/Toronto',
  'Canada/Pacific': 'America/Vancouver',
  'Australia/ACT': 'Australia/Sydney',
  'Australia/NSW': 'Australia/Sydney',
  'Australia/Victoria': 'Australia/Melbourne',
  'Australia/Queensland': 'Australia/Brisbane',
  'Australia/West': 'Australia/Perth',
  'NZ': 'Pacific/Auckland',
  'GB': 'Europe/London',
  'Japan': 'Asia/Tokyo',
  'Singapore': 'Asia/Singapore',
  'Brazil/East': 'America/Sao_Paulo',
  'Mexico/General': 'America/Mexico_City',
};

export function canonicalZone(tz) {
  return ZONE_ALIASES[tz] || tz;
}

export function countryByCode(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY);
}

/** Guess the user's country + zone from the runtime's time zone, then its language tag. */
export function detectCountry() {
  let tz = '';
  let lang = '';
  try { tz = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch { /* ignore */ }
  try { lang = (typeof navigator !== 'undefined' && navigator.language) || Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch { /* ignore */ }

  const byZone = COUNTRIES.find((c) => c.zones.includes(tz));
  if (byZone) return { country: byZone, tz };

  const region = (lang.split('-')[1] || '').toUpperCase();
  const byLang = COUNTRIES.find((c) => c.code === region);
  if (byLang) return { country: byLang, tz: isValidZone(tz) ? tz : byLang.zones[0] };

  const fallback = countryByCode(DEFAULT_COUNTRY);
  return { country: fallback, tz: isValidZone(tz) ? tz : fallback.zones[0] };
}

export function isValidZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
