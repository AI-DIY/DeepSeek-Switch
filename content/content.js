(function initDeepSeekContentScript() {
  "use strict";

  const Config = globalThis.DeepSeekSwitchConfig;
  const {
    STORAGE_KEY,
    PROMPT_MARKER,
    DEFAULT_SETTINGS,
    normalizeSettings,
    getRole,
    buildExpertPrompt
  } = Config;

  const ROOT_ID = "deepseek-switch-root";
  const TOAST_ID = "deepseek-switch-toast";
  const NEW_CHAT_PATTERN = /(开启新对话|新建对话|新的对话|新对话|new chat|start new chat)/i;
  const SEND_PATTERN = /^(发送|发送消息|send|send message)$/i;
  const COMPOSER_SELECTORS = [
    "textarea[placeholder*='DeepSeek']",
    "textarea[placeholder*='消息']",
    "textarea[placeholder*='message' i]",
    "textarea",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true'][data-slate-editor='true']",
    "div[contenteditable='true']"
  ];

  let settings = normalizeSettings(DEFAULT_SETTINGS);
  let pending = false;
  let appliedInSession = false;
  let lastUrl = location.href;
  let newChatRequested = false;
  let awaitingConversationRoute = false;
  let bypassButton = null;
  let bypassButtonUntil = 0;
  let bypassKeyboard = false;
  let initialized = false;

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
  }

  function isInsideExtensionUi(element) {
    return Boolean(element && element.closest && element.closest(`#${ROOT_ID}, #${TOAST_ID}`));
  }

  function isComposer(element) {
    if (!(element instanceof Element) || isInsideExtensionUi(element)) return false;
    return COMPOSER_SELECTORS.some((selector) => element.matches(selector));
  }

  function findComposer(preferredElement) {
    if (preferredElement instanceof Element) {
      if (isComposer(preferredElement)) return preferredElement;
      const closest = preferredElement.closest(COMPOSER_SELECTORS.join(","));
      if (closest && isComposer(closest)) return closest;
    }

    const candidates = [];
    for (const selector of COMPOSER_SELECTORS) {
      document.querySelectorAll(selector).forEach((element) => {
        if (isComposer(element) && isVisible(element) && !candidates.includes(element)) candidates.push(element);
      });
    }

    candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (bRect.bottom - aRect.bottom) || (bRect.width - aRect.width);
    });

    return candidates[0] || null;
  }

  function readComposer(composer) {
    if (!composer) return "";
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value || "";
    return composer.innerText || composer.textContent || "";
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
  }

  function setComposer(composer, value) {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      setNativeValue(composer, value);
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
      }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      composer.setSelectionRange(value.length, value.length);
      return;
    }

    composer.textContent = value;
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    }));

    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function describeButton(button) {
    return [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.getAttribute("data-testid"),
      button.getAttribute("data-test-id"),
      button.textContent
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function buttonScore(button, composer) {
    if (!(button instanceof HTMLButtonElement) || !isVisible(button)) return -Infinity;
    if (isInsideExtensionUi(button)) return -Infinity;

    const description = describeButton(button);
    const testId = `${button.dataset.testid || ""} ${button.getAttribute("data-testid") || ""}`;
    let score = 0;

    if (/send/i.test(testId)) score += 130;
    if (SEND_PATTERN.test(description)) score += 115;
    if (/(发送|send)/i.test(button.getAttribute("aria-label") || "")) score += 105;
    if (button.type === "submit") score += 90;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") score -= 35;

    const blockedLabels = /(深度思考|联网搜索|搜索|附件|上传|图片|语音|麦克风|clear|stop)/i;
    if (blockedLabels.test(description)) score -= 160;

    const buttonRect = button.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const verticalDistance = Math.abs(buttonRect.bottom - composerRect.bottom);
    const horizontalDistance = Math.abs(buttonRect.right - composerRect.right);

    if (verticalDistance < 120) score += 25;
    if (horizontalDistance < 180) score += 25;
    if (buttonRect.left >= composerRect.left + composerRect.width * .55) score += 15;
    score += Math.max(0, 30 - horizontalDistance / 6);

    return score;
  }

  function findSendButton(composer) {
    if (!composer) return null;
    const candidates = [];
    let container = composer.parentElement;

    for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
      container.querySelectorAll("button").forEach((button) => {
        if (!candidates.includes(button)) candidates.push(button);
      });
      if (candidates.length && container.querySelector("form")) break;
    }

    const ranked = candidates
      .map((button) => ({ button, score: buttonScore(button, composer) }))
      .filter((entry) => entry.score >= 55)
      .sort((a, b) => b.score - a.score);

    return ranked.length ? ranked[0].button : null;
  }

  function isExistingConversationPath(urlValue) {
    try {
      const pathname = new URL(urlValue || location.href).pathname;
      return /\/a\/chat\/s\//i.test(pathname) || /\/chat\/session\//i.test(pathname);
    } catch (_error) {
      return false;
    }
  }

  function setPending(value) {
    pending = Boolean(value && settings.enabled);
    if (pending) appliedInSession = false;
    updateStatusUi();
  }

  function resetForNewChat() {
    appliedInSession = false;
    awaitingConversationRoute = false;
    setPending(settings.enabled && settings.autoApplyNewChat);
    if (pending) {
      showToast(`已恢复「${getRole(settings).name}」配置`, true);
    }
  }

  function handleRouteChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    if (newChatRequested) {
      newChatRequested = false;
      resetForNewChat();
      return;
    }

    if (awaitingConversationRoute && isExistingConversationPath(location.href)) {
      awaitingConversationRoute = false;
      pending = false;
      appliedInSession = true;
      updateStatusUi();
      return;
    }

    if (isExistingConversationPath(location.href)) {
      pending = false;
      appliedInSession = false;
      updateStatusUi();
      return;
    }

    resetForNewChat();
  }

  function looksLikeNewChatTrigger(element) {
    const control = element && element.closest ? element.closest("button,a,[role='button']") : null;
    if (!control || isInsideExtensionUi(control)) return false;
    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.textContent
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return NEW_CHAT_PATTERN.test(label);
  }

  function findNewChatControl() {
    const controls = Array.from(document.querySelectorAll("button,a,[role='button']"));
    const matches = controls
      .filter((control) => isVisible(control) && !isInsideExtensionUi(control))
      .map((control) => {
        const label = [
          control.getAttribute("aria-label"),
          control.getAttribute("title"),
          control.textContent
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        let score = NEW_CHAT_PATTERN.test(label) ? 100 : 0;
        if (/^(开启新对话|新建对话|新对话|new chat)$/i.test(label)) score += 40;
        if (control.tagName === "BUTTON") score += 5;
        return { control, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return matches.length ? matches[0].control : null;
  }

  function showToast(message, success) {
    if (!document.body) return;
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = success ? "deepseek-switch-toast success show" : "deepseek-switch-toast show";
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function mountStatusUi() {
    if (!document.body || !settings.showPageStatus) return;
    let root = document.getElementById(ROOT_ID);
    if (root) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="deepseek-switch-status" type="button" data-action="reapply" title="点击后将专家配置应用到下一条消息">
        <span class="deepseek-switch-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
            <path d="M7 7h10M7 17h10M9 4 6 7l3 3M15 14l3 3-3 3"/>
          </svg>
        </span>
        <span class="deepseek-switch-copy">
          <strong data-role-label>专家模式</strong>
          <small data-state-label>正在准备</small>
        </span>
      </button>
      <button class="deepseek-switch-toggle" type="button" data-action="toggle" aria-label="暂停专家模式">暂停</button>
    `;

    root.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;

      if (action.dataset.action === "reapply") {
        if (!settings.enabled) {
          showToast("请先启用专家模式", false);
          return;
        }
        setPending(true);
        showToast("专家配置将应用到下一条消息", true);
        return;
      }

      settings = normalizeSettings({ ...settings, enabled: !settings.enabled });
      pending = settings.enabled;
      appliedInSession = false;
      updateStatusUi();
      try {
        await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
      } catch (_error) {
        // 页面仍保持当前状态；扩展重新加载后会恢复已保存的设置。
      }
      showToast(settings.enabled ? "专家模式已开启" : "专家模式已暂停", settings.enabled);
    });

    document.body.appendChild(root);
    updateStatusUi();
  }

  function updateStatusUi() {
    const existing = document.getElementById(ROOT_ID);

    if (!settings.showPageStatus) {
      if (existing) existing.remove();
      return;
    }

    if (!existing) {
      mountStatusUi();
      return;
    }

    const role = getRole(settings);
    const roleLabel = existing.querySelector("[data-role-label]");
    const stateLabel = existing.querySelector("[data-state-label]");
    const toggle = existing.querySelector("[data-action='toggle']");

    existing.classList.toggle("is-disabled", !settings.enabled);
    existing.classList.toggle("is-pending", pending);
    existing.classList.toggle("is-applied", settings.enabled && !pending && appliedInSession);
    roleLabel.textContent = `${role.emoji} ${role.name}`;
    stateLabel.textContent = !settings.enabled
      ? "专家模式已暂停"
      : pending
        ? "等待应用到下一条消息"
        : appliedInSession
          ? "当前会话已应用"
          : "当前会话未应用";
    toggle.textContent = settings.enabled ? "暂停" : "启用";
    toggle.setAttribute("aria-label", settings.enabled ? "暂停专家模式" : "启用专家模式");
  }

  function attemptNativeSend(composer, attempt) {
    const sendButton = findSendButton(composer);

    if (sendButton && !sendButton.disabled && sendButton.getAttribute("aria-disabled") !== "true") {
      bypassButton = sendButton;
      bypassButtonUntil = Date.now() + 1200;
      sendButton.click();
      return;
    }

    if (attempt < 8) {
      window.setTimeout(() => attemptNativeSend(composer, attempt + 1), 90);
      return;
    }

    bypassKeyboard = true;
    composer.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
    window.setTimeout(() => { bypassKeyboard = false; }, 0);
    showToast("专家配置已写入；如未发送，请再次点击发送", true);
  }

  function enhanceAndSend(event, composer) {
    const originalText = readComposer(composer).trim();
    if (!originalText || originalText.includes(PROMPT_MARKER)) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const enhancedText = buildExpertPrompt(settings, originalText);
    setComposer(composer, enhancedText);
    pending = false;
    appliedInSession = true;
    awaitingConversationRoute = true;
    updateStatusUi();
    showToast(`已应用「${getRole(settings).name}」专家配置`, true);
    window.setTimeout(() => attemptNativeSend(composer, 0), 70);
    return true;
  }

  function shouldEnhance(composer) {
    if (!settings.enabled || !pending || !composer) return false;
    const text = readComposer(composer).trim();
    return Boolean(text && !text.includes(PROMPT_MARKER));
  }

  function handleKeydown(event) {
    if (bypassKeyboard) return;
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const composer = findComposer(event.target);
    if (!shouldEnhance(composer)) return;
    enhanceAndSend(event, composer);
  }

  function handleClick(event) {
    if (looksLikeNewChatTrigger(event.target)) {
      newChatRequested = true;
      window.setTimeout(resetForNewChat, 60);
      return;
    }

    const button = event.target && event.target.closest ? event.target.closest("button") : null;
    if (!button || isInsideExtensionUi(button)) return;

    if (button === bypassButton && Date.now() < bypassButtonUntil) {
      bypassButton = null;
      bypassButtonUntil = 0;
      return;
    }

    const composer = findComposer();
    if (!shouldEnhance(composer)) return;
    const sendButton = findSendButton(composer);
    if (sendButton !== button) return;
    enhanceAndSend(event, composer);
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEY);
      settings = normalizeSettings(stored[STORAGE_KEY]);
    } catch (_error) {
      settings = normalizeSettings(DEFAULT_SETTINGS);
    }
  }

  function handleSettingsChange(newValue) {
    const previous = settings;
    const wasEnabled = previous.enabled;
    settings = normalizeSettings(newValue);
    const promptChanged = ["roleId", "detail", "format", "language", "tone", "customPrompt"]
      .some((key) => previous[key] !== settings[key]);

    if (!settings.enabled) {
      pending = false;
      appliedInSession = false;
    } else if (!wasEnabled && settings.enabled) {
      pending = true;
      appliedInSession = false;
    } else if (promptChanged && appliedInSession) {
      appliedInSession = false;
    }

    updateStatusUi();
  }

  function createNewChat() {
    newChatRequested = true;
    resetForNewChat();
    const control = findNewChatControl();
    if (control) {
      control.click();
      return true;
    }
    location.assign("https://chat.deepseek.com/");
    return true;
  }

  function initializePageState() {
    if (initialized) return;
    initialized = true;
    pending = settings.enabled && !isExistingConversationPath(location.href);
    appliedInSession = false;
    mountStatusUi();
    updateStatusUi();
    if (pending) {
      window.setTimeout(() => showToast(`已就绪 · ${getRole(settings).name}将在首条消息应用`, true), 700);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes[STORAGE_KEY]) {
      handleSettingsChange(changes[STORAGE_KEY].newValue);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "GET_PAGE_STATE") {
      sendResponse({
        ok: true,
        enabled: settings.enabled,
        pending,
        applied: appliedInSession,
        roleName: getRole(settings).name,
        url: location.href
      });
      return false;
    }

    if (message.type === "APPLY_NEXT_MESSAGE") {
      if (!settings.enabled) {
        settings = normalizeSettings({ ...settings, enabled: true });
        chrome.storage.sync.set({ [STORAGE_KEY]: settings }).catch(() => {});
      }
      setPending(true);
      showToast("专家配置将应用到下一条消息", true);
      sendResponse({ ok: true, roleName: getRole(settings).name });
      return false;
    }

    if (message.type === "CREATE_NEW_CHAT") {
      createNewChat();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("click", handleClick, true);
  window.addEventListener("popstate", handleRouteChange);
  window.setInterval(handleRouteChange, 450);

  loadSettings().then(() => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializePageState, { once: true });
    } else {
      initializePageState();
    }
  });
})();
