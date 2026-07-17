"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

class FakeElement {
  constructor({ attributes = {}, tagName = "DIV", text = "" } = {}) {
    this.attributes = { ...attributes };
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.className = "";
    this.parentElement = null;
    this.tagName = tagName;
    this.textContent = text;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  closest(selector) {
    if (selector === "button" && this.tagName === "BUTTON") return this;
    if (selector === "button,[role='button']" && (this.tagName === "BUTTON" || this.getAttribute("role") === "button")) return this;
    if (selector === "button,a,[role='button']" && this.tagName === "BUTTON") return this;
    return null;
  }

  dispatchEvent() {
    return true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  getBoundingClientRect() {
    return { width: 600, height: 80, top: 500, left: 100, right: 700, bottom: 580 };
  }

  matches() {
    return false;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeInputElement extends FakeElement {
  constructor(options) {
    super(options);
    this.checked = false;
  }
}

class FakeTextAreaElement extends FakeInputElement {
  constructor(value) {
    super({ tagName: "TEXTAREA", attributes: { placeholder: "给 DeepSeek 发送消息" } });
    this._value = value;
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._value = nextValue;
  }

  focus() {}

  matches(selector) {
    return selector.startsWith("textarea");
  }

  setSelectionRange() {}
}

class FakeButtonElement extends FakeElement {
  constructor() {
    super({ tagName: "BUTTON", attributes: { "aria-label": "发送" } });
    this.dataset = { testid: "send-button" };
    this.disabled = false;
    this.type = "submit";
    this.clickCount = 0;
  }

  click() {
    this.clickCount += 1;
  }

  getBoundingClientRect() {
    return { width: 40, height: 40, top: 530, left: 650, right: 690, bottom: 570 };
  }
}

class FakeRoleButtonElement extends FakeElement {
  constructor() {
    super({ tagName: "DIV", attributes: { role: "button" } });
    this.className = "ds-button ds-button--primary ds-button--filled ds-button--circle";
    this.dataset = {};
    this.clickCount = 0;
  }

  click() {
    this.clickCount += 1;
  }

  getBoundingClientRect() {
    return { width: 34, height: 34, top: 590, left: 650, right: 684, bottom: 624 };
  }
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

function createHarness({ useRoleButton = false } = {}) {
  const composer = new FakeTextAreaElement("请优化这句话");
  const sendButton = useRoleButton ? new FakeRoleButtonElement() : new FakeButtonElement();
  const expertMode = new FakeElement({
    attributes: {
      role: "radio",
      "data-model-type": "expert",
      "aria-checked": "true"
    },
    text: "专家模式"
  });
  const form = new FakeElement({ tagName: "FORM" });
  form.appendChild(composer);
  form.appendChild(sendButton);
  form.querySelectorAll = (selector) => selector === "button,[role='button']" ? [sendButton] : [];
  form.querySelector = (selector) => selector === "form" ? form : null;

  const body = new FakeElement({ tagName: "BODY" });
  body.appendChild(form);
  const documentListeners = new Map();
  const elementsById = new Map();
  const document = {
    body,
    readyState: "complete",
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    createElement() { return new FakeElement(); },
    getElementById(id) { return elementsById.get(id) || null; },
    querySelector(selector) {
      return selector.includes("data-model-type='expert'") ? expertMode : null;
    },
    querySelectorAll(selector) {
      if (selector === "[role='radio']") return [expertMode];
      if (selector.startsWith("textarea")) return [composer];
      return [];
    }
  };
  const originalAppend = body.appendChild.bind(body);
  body.appendChild = (child) => {
    originalAppend(child);
    if (child.id) elementsById.set(child.id, child);
    return child;
  };

  const chrome = {
    storage: {
      sync: {
        async get() {
          return {
            settings: {
              enabled: true,
              autoApplyNewChat: true,
              roleId: "writer",
              scene: "write",
              detail: "concise",
              format: "structured",
              language: "bilingual",
              tone: "friendly",
              customPrompt: "先给三个标题，再给最终版本",
              showPageStatus: false
            }
          };
        },
        async set() {}
      },
      onChanged: { addListener() {} }
    },
    runtime: { onMessage: { addListener() {} } }
  };

  const shortTimeout = (callback, delay = 0) => delay >= 60 ? 0 : setTimeout(callback, delay);
  const context = vm.createContext({
    chrome,
    document,
    location: { href: "https://chat.deepseek.com/", assign() {} },
    Element: FakeElement,
    Event: FakeEvent,
    HTMLButtonElement: FakeButtonElement,
    HTMLInputElement: FakeInputElement,
    HTMLTextAreaElement: FakeTextAreaElement,
    InputEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    MutationObserver: class { observe() {} },
    URL,
    addEventListener() {},
    clearInterval() {},
    clearTimeout,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    setInterval: () => 0,
    setTimeout: shortTimeout,
    window: null
  });
  context.window = context;

  vm.runInContext(fs.readFileSync(path.join(projectRoot, "shared/config.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, "content/content.js"), "utf8"), context);

  return { composer, documentListeners, sendButton };
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function createInterceptableEvent(target, overrides = {}) {
  return {
    target,
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...overrides
  };
}

test("Enter applies the selected role, answer preferences and custom requirement once", async () => {
  const harness = createHarness();
  await flushAsync();
  const event = createInterceptableEvent(harness.composer);

  harness.documentListeners.get("keydown")(event);

  assert.equal(event.prevented, true);
  assert.match(harness.composer.value, /^\[DeepSeek Switch 专家配置\]/);
  assert.match(harness.composer.value, /写作顾问（内容策略师）/);
  assert.match(harness.composer.value, /回答语言：中英双语/);
  assert.match(harness.composer.value, /表达语气：友好易懂/);
  assert.match(harness.composer.value, /详略程度：精简结论/);
  assert.match(harness.composer.value, /内容格式：结构化分点/);
  assert.match(harness.composer.value, /专业要求：先给三个标题，再给最终版本/);
  assert.match(harness.composer.value, /\[用户问题\]\n请优化这句话$/);
  assert.equal(harness.composer.value.match(/\[DeepSeek Switch 专家配置\]/g).length, 1);

  const secondEvent = createInterceptableEvent(harness.composer);
  harness.documentListeners.get("keydown")(secondEvent);
  assert.equal(secondEvent.prevented, false);
  assert.equal(harness.composer.value.match(/\[DeepSeek Switch 专家配置\]/g).length, 1);
});

test("clicking DeepSeek's send button follows the same prompt enhancement path", async () => {
  const harness = createHarness();
  await flushAsync();
  const event = createInterceptableEvent(harness.sendButton, { key: undefined });

  harness.documentListeners.get("click")(event);

  assert.equal(event.prevented, true);
  assert.match(harness.composer.value, /\[用户问题\]\n请优化这句话$/);
  assert.equal(harness.sendButton.clickCount, 0);
});

test("clicking DeepSeek's div role=button send control applies the prompt", async () => {
  const harness = createHarness({ useRoleButton: true });
  await flushAsync();
  const event = createInterceptableEvent(harness.sendButton, { key: undefined });

  harness.documentListeners.get("click")(event);

  assert.equal(event.prevented, true);
  assert.match(harness.composer.value, /^\[DeepSeek Switch 专家配置\]/);
  assert.match(harness.composer.value, /\[用户问题\]\n请优化这句话$/);
});
