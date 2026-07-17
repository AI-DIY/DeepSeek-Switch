"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

class FakeElement {
  constructor({ text = "", tagName = "DIV", attributes = {} } = {}) {
    this.attributes = { ...attributes };
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.parentElement = null;
    this.tagName = tagName;
    this.textContent = text;
    this.clickCount = 0;
    this.children = [];
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return { width: 140, height: 36, top: 0, left: 0, right: 140, bottom: 36 };
  }

  click() {
    this.clickCount += 1;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
}

class FakeInputElement extends FakeElement {
  constructor(options) {
    super(options);
    this.checked = false;
  }
}

function createHarness(initialSettings) {
  const expertModeControl = new FakeElement({
    text: "专家模式",
    attributes: {
      role: "radio",
      "data-model-type": "expert",
      "aria-checked": "true"
    }
  });
  const newChatControl = new FakeElement({
    text: "开启新对话",
    tagName: "BUTTON",
    attributes: { "aria-label": "开启新对话" }
  });
  const storageSets = [];
  let runtimeListener = null;
  let storageListener = null;

  const document = {
    body: new FakeElement(),
    readyState: "complete",
    addEventListener() {},
    createElement() { return new FakeElement(); },
    getElementById() { return null; },
    querySelector(selector) {
      return selector.includes("data-model-type='expert'") ? expertModeControl : null;
    },
    querySelectorAll(selector) {
      if (selector === "button,a,[role='button']") return [newChatControl];
      if (selector === "[role='radio']") return [expertModeControl];
      return [];
    }
  };

  const chrome = {
    storage: {
      sync: {
        async get() { return { settings: initialSettings }; },
        async set(value) { storageSets.push(value); }
      },
      onChanged: {
        addListener(listener) { storageListener = listener; }
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) { runtimeListener = listener; }
      }
    }
  };

  const shortTimeout = (callback, delay = 0) => delay > 500 ? 0 : setTimeout(callback, delay);
  const context = vm.createContext({
    chrome,
    document,
    location: { href: "https://chat.deepseek.com/", assign() {} },
    Element: FakeElement,
    HTMLInputElement: FakeInputElement,
    HTMLTextAreaElement: class extends FakeInputElement {},
    MutationObserver: class { observe() {} },
    URL,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setTimeout: shortTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    addEventListener() {},
    window: null
  });
  context.window = context;

  vm.runInContext(fs.readFileSync(path.join(projectRoot, "shared/config.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, "content/content.js"), "utf8"), context);

  return {
    context,
    newChatControl,
    storageSets,
    getRuntimeListener: () => runtimeListener,
    getStorageListener: () => storageListener
  };
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function sendMessage(listener, message) {
  let response;
  listener(message, {}, (value) => { response = value; });
  return response;
}

test("new-chat automatic application stays off after a page refresh", async () => {
  const harness = createHarness({
    enabled: true,
    autoApplyNewChat: false,
    showPageStatus: false
  });
  await flushAsync();

  const state = sendMessage(harness.getRuntimeListener(), { type: "GET_PAGE_STATE" });
  assert.equal(state.ok, true);
  assert.equal(state.pending, false);
  assert.equal(state.applied, false);
});

test("turning off new-chat automatic application clears an existing automatic pending state", async () => {
  const harness = createHarness({
    enabled: true,
    autoApplyNewChat: true,
    showPageStatus: false
  });
  await flushAsync();

  harness.getStorageListener()({
    settings: {
      newValue: {
        enabled: true,
        autoApplyNewChat: false,
        showPageStatus: false
      }
    }
  }, "sync");

  const state = sendMessage(harness.getRuntimeListener(), { type: "GET_PAGE_STATE" });
  assert.equal(state.pending, false);
});

test("apply-next works when automatic new-chat application is disabled", async () => {
  const harness = createHarness({
    enabled: true,
    autoApplyNewChat: false,
    roleId: "writer",
    showPageStatus: false
  });
  await flushAsync();

  const applied = sendMessage(harness.getRuntimeListener(), { type: "APPLY_NEXT_MESSAGE" });
  const state = sendMessage(harness.getRuntimeListener(), { type: "GET_PAGE_STATE" });

  assert.deepEqual(JSON.parse(JSON.stringify(applied)), { ok: true, roleName: "写作顾问" });
  assert.equal(state.pending, true);
});

test("create-new-chat command uses the visible DeepSeek control", async () => {
  const harness = createHarness({
    enabled: true,
    autoApplyNewChat: false,
    showPageStatus: false
  });
  await flushAsync();

  const result = sendMessage(harness.getRuntimeListener(), { type: "CREATE_NEW_CHAT" });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true });
  assert.equal(harness.newChatControl.clickCount, 1);
});
