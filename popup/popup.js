(function initPopup() {
  "use strict";

  const Config = globalThis.DeepSeekSwitchConfig;
  const {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    ROLE_TEMPLATES,
    SCENES,
    normalizeSettings
  } = Config;

  const $ = (id) => document.getElementById(id);
  let settings = normalizeSettings(DEFAULT_SETTINGS);
  let saveTimer = 0;
  let activeTab = null;

  function populateStaticControls() {
    $("roleId").innerHTML = Object.values(ROLE_TEMPLATES)
      .map((role) => `<option value="${role.id}">${role.emoji} ${role.name} · ${role.subtitle}</option>`)
      .join("");

    $("sceneGrid").innerHTML = Object.values(SCENES)
      .map((scene) => (
        `<button class="scene-button" type="button" data-scene="${scene.id}" data-role="${scene.roleId}">` +
          `<span class="scene-emoji">${scene.emoji}</span>${scene.label}` +
        "</button>"
      ))
      .join("");
  }

  function renderSettings() {
    $("enabled").checked = settings.enabled;
    $("autoApplyNewChat").checked = settings.autoApplyNewChat;
    $("showPageStatus").checked = settings.showPageStatus;
    $("roleId").value = settings.roleId;
    $("detail").value = settings.detail;
    $("format").value = settings.format;
    $("language").value = settings.language;
    $("tone").value = settings.tone;
    $("customPrompt").value = settings.customPrompt;
    updateCharacterCount();
    updateSceneSelection();
    updateEnabledAppearance();
  }

  function collectSettings() {
    return normalizeSettings({
      enabled: $("enabled").checked,
      autoApplyNewChat: $("autoApplyNewChat").checked,
      showPageStatus: $("showPageStatus").checked,
      roleId: $("roleId").value,
      scene: settings.scene,
      detail: $("detail").value,
      format: $("format").value,
      language: $("language").value,
      tone: $("tone").value,
      customPrompt: $("customPrompt").value
    });
  }

  function updateSceneSelection() {
    document.querySelectorAll(".scene-button").forEach((button) => {
      button.classList.toggle("selected", button.dataset.scene === settings.scene);
    });
  }

  function updateEnabledAppearance() {
    document.body.classList.toggle("disabled", !settings.enabled);
    $("statusDot").classList.toggle("offline", !settings.enabled);
  }

  function updateCharacterCount() {
    $("characterCount").textContent = `${$("customPrompt").value.length} / 3000`;
  }

  function setSaveState(text, state) {
    const node = $("saveState");
    node.textContent = text;
    node.className = `save-state${state ? ` ${state}` : ""}`;
  }

  async function saveNow() {
    window.clearTimeout(saveTimer);
    settings = collectSettings();
    updateEnabledAppearance();
    setSaveState("正在保存…", "");

    try {
      await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
      setSaveState("已自动保存", "saved");
      window.setTimeout(refreshPageStatus, 120);
    } catch (_error) {
      setSaveState("保存失败", "error");
    }
  }

  function queueSave() {
    settings = collectSettings();
    updateEnabledAppearance();
    setSaveState("等待保存…", "");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 220);
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function sendToActiveTab(message) {
    activeTab = activeTab || await getActiveTab();
    if (!activeTab || !activeTab.id) throw new Error("没有可用标签页");
    return chrome.tabs.sendMessage(activeTab.id, message);
  }

  async function refreshPageStatus() {
    const statusText = $("pageStatus");
    const statusDot = $("statusDot");

    try {
      activeTab = await getActiveTab();
      const isDeepSeek = activeTab && typeof activeTab.url === "string" && activeTab.url.startsWith("https://chat.deepseek.com/");

      if (!isDeepSeek) {
        statusText.textContent = settings.enabled ? "已就绪 · 打开 DeepSeek 后生效" : "专家模式已暂停";
        statusDot.className = `status-dot ${settings.enabled ? "" : "offline"}`.trim();
        return;
      }

      const response = await sendToActiveTab({ type: "GET_PAGE_STATE" });
      if (response && response.ok) {
        statusText.textContent = response.pending
          ? response.nativeExpertModeActive
            ? `${response.roleName} · 专家模式已开启，等待首条消息`
            : `${response.roleName} · 正在切换专家模式`
          : `${response.roleName} · ${response.enabled ? "运行中" : "已暂停"}`;
        statusDot.className = `status-dot ${response.enabled ? "online" : "offline"}`;
      }
    } catch (_error) {
      statusText.textContent = "DeepSeek 页面刷新后即可生效";
      statusDot.className = `status-dot ${settings.enabled ? "" : "offline"}`.trim();
    }
  }

  function bindControls() {
    ["enabled", "autoApplyNewChat", "showPageStatus", "detail", "format", "language", "tone"]
      .forEach((id) => $(id).addEventListener("change", () => {
        queueSave();
      }));

    $("roleId").addEventListener("change", () => {
      const role = ROLE_TEMPLATES[$("roleId").value];
      if (role) settings.scene = role.scene;
      updateSceneSelection();
      queueSave();
    });

    $("customPrompt").addEventListener("input", () => {
      updateCharacterCount();
      queueSave();
    });

    $("sceneGrid").addEventListener("click", (event) => {
      const button = event.target.closest(".scene-button");
      if (!button) return;
      settings.scene = button.dataset.scene;
      $("roleId").value = button.dataset.role;
      updateSceneSelection();
      queueSave();
    });

    $("applyNext").addEventListener("click", async () => {
      await saveNow();
      try {
        const response = await sendToActiveTab({ type: "APPLY_NEXT_MESSAGE" });
        if (!response || !response.ok) throw new Error("页面不可用");
        $("pageStatus").textContent = `${response.roleName} · 将应用到下一条消息`;
        $("statusDot").className = "status-dot online";
        setSaveState("已安排应用", "saved");
      } catch (_error) {
        setSaveState("请先打开 DeepSeek", "error");
      }
    });

    $("newChat").addEventListener("click", async () => {
      await saveNow();
      try {
        activeTab = activeTab || await getActiveTab();
        const isDeepSeek = activeTab && typeof activeTab.url === "string" && activeTab.url.startsWith("https://chat.deepseek.com/");
        if (isDeepSeek) {
          await sendToActiveTab({ type: "CREATE_NEW_CHAT" });
        } else {
          await chrome.tabs.create({ url: "https://chat.deepseek.com/" });
        }
        window.close();
      } catch (_error) {
        await chrome.tabs.create({ url: "https://chat.deepseek.com/" });
        window.close();
      }
    });

    $("exportSettings").addEventListener("click", () => {
      const payload = JSON.stringify({
        product: "DeepSeek Switch",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: collectSettings()
      }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `deepseek-switch-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaveState("设置已导出", "saved");
    });

    $("importSettings").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        settings = normalizeSettings(parsed.settings || parsed);
        renderSettings();
        await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
        setSaveState("设置已导入", "saved");
        window.setTimeout(refreshPageStatus, 120);
      } catch (_error) {
        setSaveState("导入文件无效", "error");
      } finally {
        event.target.value = "";
      }
    });

    $("resetSettings").addEventListener("click", async () => {
      if (!window.confirm("确定恢复 DeepSeek Switch 的默认设置吗？")) return;
      settings = normalizeSettings(DEFAULT_SETTINGS);
      renderSettings();
      await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
      setSaveState("已恢复默认设置", "saved");
      refreshPageStatus();
    });
  }

  async function start() {
    populateStaticControls();
    bindControls();

    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEY);
      settings = normalizeSettings(stored[STORAGE_KEY]);
    } catch (_error) {
      settings = normalizeSettings(DEFAULT_SETTINGS);
    }

    renderSettings();
    await refreshPageStatus();
  }

  start();
})();
