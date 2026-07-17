"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

function loadConfig() {
  const context = vm.createContext({ globalThis: null });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(projectRoot, "shared/config.js"), "utf8"), context);
  return context.DeepSeekSwitchConfig;
}

test("normalizeSettings fills defaults and rejects invalid option values", () => {
  const Config = loadConfig();
  const settings = Config.normalizeSettings({
    enabled: "yes",
    roleId: "unknown",
    detail: "verbose",
    format: "html",
    language: "fr",
    tone: "casual"
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(settings)),
    JSON.parse(JSON.stringify(Config.DEFAULT_SETTINGS))
  );
});

test("normalizeSettings keeps every supported role and answer preference", () => {
  const Config = loadConfig();

  for (const roleId of Object.keys(Config.ROLE_TEMPLATES)) {
    const settings = Config.normalizeSettings({
      roleId,
      detail: "deep",
      format: "markdown",
      language: "bilingual",
      tone: "rigorous"
    });
    assert.equal(settings.roleId, roleId);
    assert.equal(settings.detail, "deep");
    assert.equal(settings.format, "markdown");
    assert.equal(settings.language, "bilingual");
    assert.equal(settings.tone, "rigorous");
  }
});

test("custom requirements are trimmed and limited to 3000 characters", () => {
  const Config = loadConfig();
  const settings = Config.normalizeSettings({ customPrompt: `  ${"a".repeat(3100)}  ` });

  assert.equal(settings.customPrompt.length, 3000);
  assert.equal(settings.customPrompt, "a".repeat(3000));
});

test("buildExpertPrompt applies role, preference and custom requirement choices", () => {
  const Config = loadConfig();
  const prompt = Config.buildExpertPrompt({
    roleId: "translator",
    detail: "concise",
    format: "plain",
    language: "en",
    tone: "friendly",
    customPrompt: "Keep product names unchanged."
  }, "翻译这句话");

  assert.match(prompt, /翻译专家（本地化顾问）/);
  assert.match(prompt, /回答语言：English/);
  assert.match(prompt, /表达语气：友好易懂/);
  assert.match(prompt, /详略程度：精简结论/);
  assert.match(prompt, /内容格式：自然段文本/);
  assert.match(prompt, /专业要求：Keep product names unchanged\./);
  assert.match(prompt, /\[用户问题\]\n翻译这句话$/);
});

test("buildExpertPrompt falls back to the selected role requirement", () => {
  const Config = loadConfig();
  const prompt = Config.buildExpertPrompt({ roleId: "product", customPrompt: "" }, "分析需求");

  assert.match(prompt, /目标用户、核心场景、需求强度和商业约束/);
});
