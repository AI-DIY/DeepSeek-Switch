"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.checked = false;
    this.classList = new FakeClassList();
    this.className = "";
    this.dataset = {};
    this.download = "";
    this.files = [];
    this.href = "";
    this.innerHTML = "";
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
    this.clickCount = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async trigger(type, event = {}) {
    const listeners = this.listeners.get(type) || [];
    const payload = { target: this, ...event };
    await Promise.all(listeners.map((listener) => listener(payload)));
  }

  click() {
    this.clickCount += 1;
    return this.trigger("click");
  }

  closest(selector) {
    return selector === ".scene-button" && this.dataset.scene ? this : null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

function createHarness({
  activeUrl = "https://chat.deepseek.com/",
  initialSettings = {
    enabled: true,
    autoApplyNewChat: true,
    roleId: "writer",
    scene: "write",
    detail: "standard",
    format: "steps",
    language: "zh-CN",
    tone: "professional",
    customPrompt: "",
    showPageStatus: true
  }
} = {}) {
  const ids = [
    "statusDot", "pageStatus", "enabled", "autoApplyNewChat", "showPageStatus",
    "roleId", "sceneGrid", "detail", "format", "language", "tone",
    "customPrompt", "characterCount", "saveState", "applyNext", "newChat",
    "exportSettings", "importSettings", "resetSettings", "importFile"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const sceneButtons = [
    ["code", "programmer"],
    ["write", "writer"],
    ["study", "academic"],
    ["product", "product"]
  ].map(([scene, role]) => {
    const button = new FakeElement();
    button.dataset.scene = scene;
    button.dataset.role = role;
    return button;
  });
  const body = new FakeElement("body");
  const anchors = [];
  let storedSettings = clone(initialSettings);
  const storageSets = [];
  const sentMessages = [];
  const createdTabs = [];
  let closed = false;
  let confirmResult = true;
  let exportedBlob = null;

  const roleNames = {
    programmer: "编程专家",
    writer: "写作顾问",
    academic: "学术导师",
    product: "产品经理",
    translator: "翻译专家",
    analyst: "分析顾问"
  };

  const document = {
    body,
    getElementById(id) { return elements[id] || null; },
    querySelectorAll(selector) { return selector === ".scene-button" ? sceneButtons : []; },
    createElement(tagName) {
      const element = new FakeElement();
      if (tagName === "a") anchors.push(element);
      return element;
    }
  };

  const chrome = {
    storage: {
      sync: {
        async get() { return { settings: clone(storedSettings) }; },
        async set(payload) {
          storedSettings = clone(payload.settings);
          storageSets.push(clone(payload.settings));
        }
      }
    },
    tabs: {
      async query() { return [{ id: 7, url: activeUrl }]; },
      async sendMessage(_tabId, message) {
        sentMessages.push(clone(message));
        if (message.type === "GET_PAGE_STATE") {
          return {
            ok: true,
            enabled: storedSettings.enabled,
            pending: false,
            applied: false,
            nativeExpertModeActive: false,
            roleName: roleNames[storedSettings.roleId]
          };
        }
        if (message.type === "APPLY_NEXT_MESSAGE") {
          return { ok: true, roleName: roleNames[storedSettings.roleId] };
        }
        return { ok: true };
      },
      async create(options) { createdTabs.push(options); }
    }
  };

  const shortTimeout = (callback, delay = 0) => delay > 500 ? 0 : setTimeout(callback, 0);
  const fakeUrl = {
    createObjectURL(blob) {
      exportedBlob = blob;
      return "blob:deepseek-switch-test";
    },
    revokeObjectURL() {}
  };
  const context = vm.createContext({
    Blob,
    URL: fakeUrl,
    chrome,
    clearTimeout,
    confirm: () => confirmResult,
    document,
    setTimeout: shortTimeout,
    window: null,
    close: () => { closed = true; }
  });
  context.window = context;

  vm.runInContext(fs.readFileSync(path.join(projectRoot, "shared/config.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, "popup/popup.js"), "utf8"), context);

  return {
    anchors,
    createdTabs,
    elements,
    getClosed: () => closed,
    getExportedBlob: () => exportedBlob,
    getStoredSettings: () => clone(storedSettings),
    sceneButtons,
    sentMessages,
    setConfirmResult: (value) => { confirmResult = value; },
    storageSets
  };
}

test("popup loads roles, scenes and saved preferences", async () => {
  const harness = createHarness();
  await flushAsync();

  assert.match(harness.elements.roleId.innerHTML, /写作顾问/);
  assert.match(harness.elements.roleId.innerHTML, /翻译专家/);
  assert.match(harness.elements.sceneGrid.innerHTML, /产品分析/);
  assert.equal(harness.elements.roleId.value, "writer");
  assert.equal(harness.elements.detail.value, "standard");
  assert.equal(harness.elements.characterCount.textContent, "0 / 3000");
  assert.equal(harness.elements.pageStatus.textContent, "写作顾问 · 运行中");
});

test("role, scene, answer preferences and custom requirements save automatically", async () => {
  const harness = createHarness();
  await flushAsync();

  harness.elements.roleId.value = "analyst";
  await harness.elements.roleId.trigger("change");
  await flushAsync();
  assert.equal(harness.getStoredSettings().roleId, "analyst");
  assert.equal(harness.elements.pageStatus.textContent, "分析顾问 · 运行中");

  await harness.elements.sceneGrid.trigger("click", { target: harness.sceneButtons[3] });
  harness.elements.detail.value = "deep";
  harness.elements.format.value = "markdown";
  harness.elements.language.value = "en";
  harness.elements.tone.value = "rigorous";
  harness.elements.autoApplyNewChat.checked = false;
  harness.elements.showPageStatus.checked = false;
  for (const id of ["detail", "format", "language", "tone", "autoApplyNewChat", "showPageStatus"]) {
    await harness.elements[id].trigger("change");
  }
  harness.elements.customPrompt.value = "  只输出可执行结论  ";
  await harness.elements.customPrompt.trigger("input");
  await flushAsync();

  const settings = harness.getStoredSettings();
  assert.equal(settings.roleId, "product");
  assert.equal(settings.scene, "product");
  assert.equal(settings.detail, "deep");
  assert.equal(settings.format, "markdown");
  assert.equal(settings.language, "en");
  assert.equal(settings.tone, "rigorous");
  assert.equal(settings.autoApplyNewChat, false);
  assert.equal(settings.showPageStatus, false);
  assert.equal(settings.customPrompt, "只输出可执行结论");
  assert.equal(harness.elements.characterCount.textContent, "12 / 3000");
});

test("apply-next and create-new-chat commands reach the active DeepSeek tab", async () => {
  const harness = createHarness();
  await flushAsync();

  await harness.elements.applyNext.trigger("click");
  assert.equal(harness.sentMessages.some((message) => message.type === "APPLY_NEXT_MESSAGE"), true);
  assert.equal(harness.elements.saveState.textContent, "已安排应用");

  await harness.elements.newChat.trigger("click");
  assert.equal(harness.sentMessages.some((message) => message.type === "CREATE_NEW_CHAT"), true);
  assert.equal(harness.getClosed(), true);
});

test("create-new-chat opens DeepSeek when the active tab is another website", async () => {
  const harness = createHarness({ activeUrl: "https://example.com/" });
  await flushAsync();

  await harness.elements.newChat.trigger("click");

  assert.deepEqual(clone(harness.createdTabs), [{ url: "https://chat.deepseek.com/" }]);
  assert.equal(harness.getClosed(), true);
});

test("settings export, import and reset complete successfully", async () => {
  const harness = createHarness();
  await flushAsync();

  await harness.elements.exportSettings.trigger("click");
  const exported = JSON.parse(await harness.getExportedBlob().text());
  assert.equal(exported.product, "DeepSeek Switch");
  assert.equal(exported.settings.roleId, "writer");
  assert.match(harness.anchors[0].download, /^deepseek-switch-\d{4}-\d{2}-\d{2}\.json$/);

  harness.elements.importFile.files = [{
    async text() {
      return JSON.stringify({
        settings: {
          enabled: true,
          autoApplyNewChat: false,
          roleId: "translator",
          detail: "concise",
          format: "plain",
          language: "bilingual",
          tone: "friendly",
          customPrompt: "保留术语",
          showPageStatus: false
        }
      });
    }
  }];
  await harness.elements.importFile.trigger("change");
  await flushAsync();
  assert.equal(harness.getStoredSettings().roleId, "translator");
  assert.equal(harness.elements.roleId.value, "translator");
  assert.equal(harness.elements.pageStatus.textContent, "翻译专家 · 运行中");

  await harness.elements.resetSettings.trigger("click");
  assert.equal(harness.getStoredSettings().roleId, "programmer");
  assert.equal(harness.getStoredSettings().autoApplyNewChat, true);
  assert.equal(harness.elements.saveState.textContent, "已恢复默认设置");
});

test("invalid import reports an error and keeps current settings", async () => {
  const harness = createHarness();
  await flushAsync();
  const before = harness.getStoredSettings();

  harness.elements.importFile.files = [{ async text() { return "not-json"; } }];
  await harness.elements.importFile.trigger("change");

  assert.deepEqual(harness.getStoredSettings(), before);
  assert.equal(harness.elements.saveState.textContent, "导入文件无效");
});
