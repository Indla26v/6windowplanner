// Storage adapter: chrome.storage.local inside the extension, localStorage when the
// page is opened directly (e.g. for a quick preview from a static server).
export const KEY = 'sixWindowConfig';
export const inExtension = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);

export const storage = {
  async load() {
    if (inExtension) return (await chrome.storage.local.get(KEY))[KEY] || null;
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  },
  save(cfg) {
    if (inExtension) return chrome.storage.local.set({ [KEY]: cfg });
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ }
    return undefined;
  },
  subscribe(cb) {
    if (inExtension) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[KEY]) cb(changes[KEY].newValue);
      });
    }
  },
};

export async function detectReset() {
  const res = await chrome.runtime.sendMessage({ type: 'six-window:detect' });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Detection failed.');
  return res.result;
}
