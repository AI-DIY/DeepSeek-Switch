importScripts("shared/config.js");

const {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings
} = globalThis.DeepSeekSwitchConfig;

async function loadSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

async function ensureSettings() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const settings = normalizeSettings(stored[STORAGE_KEY]);
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  return settings;
}

async function updateBadge(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.action.setBadgeText({ text: normalized.enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: normalized.enabled ? "#1f8a66" : "#9aa0a6" });
  await chrome.action.setTitle({
    title: normalized.enabled ? "DeepSeek Switch · 专家模式已开启" : "DeepSeek Switch · 已暂停"
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureSettings().then(updateBadge).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings().then(updateBadge).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[STORAGE_KEY]) return;
  updateBadge(changes[STORAGE_KEY].newValue).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "GET_SETTINGS") return false;

  loadSettings()
    .then((settings) => sendResponse({ ok: true, settings }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

loadSettings().then(updateBadge).catch(() => {});
