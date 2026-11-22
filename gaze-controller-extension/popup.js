const DEF = { enabled: false, source: 'pointer', dwell: 1200, smooth: 55, scrollSpeed: 7, cursor: 34, snap: true };
const $ = id => document.getElementById(id);
const ids = ['enabled', 'source', 'dwell', 'smooth', 'scrollSpeed', 'cursor', 'snap'];
chrome.storage.sync.get(DEF, (v) => {
  ids.forEach(k => { const el = $(k); if (el.type === 'checkbox') el.checked = v[k]; else el.value = v[k]; });
  $('dwellV').textContent = (v.dwell / 1000).toFixed(1);
});
ids.forEach(k => $(k).addEventListener('input', () => {
  const el = $(k); const val = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' ? el.value : Number(el.value));
  if (k === 'dwell') $('dwellV').textContent = (val / 1000).toFixed(1);
  chrome.storage.sync.set({ [k]: val });
}));
const toTab = (msg) => chrome.tabs.query({ active: true, currentWindow: true }, t => t[0] && chrome.tabs.sendMessage(t[0].id, msg).catch(() => {}));
$('cal').onclick = () => toTab({ type: 'calibrate' });
$('pause').onclick = () => toTab({ type: 'toggle-pause' });
