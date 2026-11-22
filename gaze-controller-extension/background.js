// Service worker: tab switching + hotkey relay.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'tab') {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const cur = tabs.findIndex(t => t.id === sender.tab.id);
      if (cur < 0 || tabs.length < 2) return;
      const next = (cur + (msg.dir === 'next' ? 1 : -1) + tabs.length) % tabs.length;
      chrome.tabs.update(tabs[next].id, { active: true });
    });
  }
});
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== 'toggle-pause') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle-pause' }).catch(() => {});
  });
});
