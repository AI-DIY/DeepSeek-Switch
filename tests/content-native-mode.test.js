"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = { ...attributes };
    this.tagName = "DIV";
    this.textContent = "专家模式";
    this.parentElement = null;
    this.clickCount = 0;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return { width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32 };
  }

  click() {
    this.clickCount += 1;
    this.attributes["aria-checked"] = "true";
  }
}

class FakeInputElement extends FakeElement {
  constructor(attributes = {}) {
    super(attributes);
    this.checked = false;
  }
}

const expertMode = new FakeElement({
  role: "radio",
  "data-model-type": "expert",
  "aria-checked": "false"
});

const shortTimeout = (callback, delay = 0) => delay > 500 ? 0 : setTimeout(callback, delay);
const document = {
  body: new FakeElement(),
  readyState: "complete",
  addEventListener() {},
  getElementById() { return null; },
  querySelector(selector) {
    return selector.includes("data-model-type='expert'") ? expertMode : null;
  },
  querySelectorAll(selector) {
    return selector === "[role='radio']" ? [expertMode] : [];
  }
};

const chrome = {
  storage: {
    sync: {
      async get() {
        return {
          settings: {
            enabled: true,
            autoApplyNewChat: true,
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

const context = vm.createContext({
  assert,
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

setTimeout(() => {
  assert.equal(expertMode.getAttribute("aria-checked"), "true");
  assert.equal(expertMode.clickCount, 1);
  console.log("native expert mode auto-selection: ok");
}, 320);
