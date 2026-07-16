(function initDeepSeekSwitchConfig(globalScope) {
  "use strict";

  const STORAGE_KEY = "settings";
  const PROMPT_MARKER = "[DeepSeek Switch 专家配置]";

  const ROLE_TEMPLATES = {
    programmer: {
      id: "programmer",
      emoji: "💻",
      name: "编程专家",
      subtitle: "全栈工程师",
      scene: "code",
      requirement: "优先给出可运行、可维护的方案；代码注明关键逻辑；主动指出安全、性能、兼容性和边界条件风险。"
    },
    writer: {
      id: "writer",
      emoji: "✍️",
      name: "写作顾问",
      subtitle: "内容策略师",
      scene: "write",
      requirement: "先识别受众、目的和语气，再优化结构与表达；避免空泛套话，必要时提供多个可选版本。"
    },
    academic: {
      id: "academic",
      emoji: "🎓",
      name: "学术导师",
      subtitle: "研究方法顾问",
      scene: "study",
      requirement: "区分事实、推论与假设；用定义、例子和推导解释概念；对不确定信息明确标注，并避免编造引用。"
    },
    product: {
      id: "product",
      emoji: "📊",
      name: "产品经理",
      subtitle: "用户洞察顾问",
      scene: "product",
      requirement: "从目标用户、核心场景、需求强度和商业约束出发；给出优先级、验证方法和可执行的下一步。"
    },
    translator: {
      id: "translator",
      emoji: "🌐",
      name: "翻译专家",
      subtitle: "本地化顾问",
      scene: "translate",
      requirement: "忠实保留原意、语气和专业术语；根据目标读者进行自然本地化；对歧义给出简短说明。"
    },
    analyst: {
      id: "analyst",
      emoji: "🔎",
      name: "分析顾问",
      subtitle: "资料与决策分析",
      scene: "analysis",
      requirement: "先给出核心判断，再展示依据、假设与推理链；区分相关性和因果性，并给出风险或反例。"
    }
  };

  const SCENES = {
    code: { id: "code", emoji: "💻", label: "代码设计", roleId: "programmer" },
    write: { id: "write", emoji: "✍️", label: "文案创作", roleId: "writer" },
    study: { id: "study", emoji: "🎓", label: "知识学习", roleId: "academic" },
    product: { id: "product", emoji: "📊", label: "产品分析", roleId: "product" }
  };

  const OPTION_LABELS = {
    detail: {
      concise: "精简结论",
      standard: "标准详略",
      deep: "深入展开"
    },
    format: {
      structured: "结构化分点",
      steps: "结论 + 步骤",
      markdown: "Markdown 文档",
      plain: "自然段文本"
    },
    language: {
      "zh-CN": "简体中文",
      bilingual: "中英双语",
      en: "English"
    },
    tone: {
      professional: "专业直接",
      friendly: "友好易懂",
      rigorous: "严谨审慎"
    }
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    autoApplyNewChat: true,
    roleId: "programmer",
    scene: "code",
    detail: "standard",
    format: "steps",
    language: "zh-CN",
    tone: "professional",
    customPrompt: "",
    showPageStatus: true
  };

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function pickEnum(value, source, fallback) {
    return typeof value === "string" && hasOwn(source, value) ? value : fallback;
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const roleId = hasOwn(ROLE_TEMPLATES, source.roleId) ? source.roleId : DEFAULT_SETTINGS.roleId;
    const scene = hasOwn(SCENES, source.scene) ? source.scene : (ROLE_TEMPLATES[roleId].scene || DEFAULT_SETTINGS.scene);

    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
      autoApplyNewChat: typeof source.autoApplyNewChat === "boolean" ? source.autoApplyNewChat : DEFAULT_SETTINGS.autoApplyNewChat,
      roleId,
      scene,
      detail: pickEnum(source.detail, OPTION_LABELS.detail, DEFAULT_SETTINGS.detail),
      format: pickEnum(source.format, OPTION_LABELS.format, DEFAULT_SETTINGS.format),
      language: pickEnum(source.language, OPTION_LABELS.language, DEFAULT_SETTINGS.language),
      tone: pickEnum(source.tone, OPTION_LABELS.tone, DEFAULT_SETTINGS.tone),
      customPrompt: typeof source.customPrompt === "string" ? source.customPrompt.trim().slice(0, 3000) : "",
      showPageStatus: typeof source.showPageStatus === "boolean" ? source.showPageStatus : DEFAULT_SETTINGS.showPageStatus
    };
  }

  function getRole(settings) {
    const normalized = normalizeSettings(settings);
    return ROLE_TEMPLATES[normalized.roleId];
  }

  function buildExpertPrompt(settings, userMessage) {
    const normalized = normalizeSettings(settings);
    const role = ROLE_TEMPLATES[normalized.roleId];
    const customRequirement = normalized.customPrompt || role.requirement;

    const lines = [
      PROMPT_MARKER,
      `你现在以“${role.name}（${role.subtitle}）”的身份回答。`,
      `回答语言：${OPTION_LABELS.language[normalized.language]}。`,
      `表达语气：${OPTION_LABELS.tone[normalized.tone]}。`,
      `详略程度：${OPTION_LABELS.detail[normalized.detail]}。`,
      `内容格式：${OPTION_LABELS.format[normalized.format]}。`,
      `专业要求：${customRequirement}`,
      "请直接解决用户问题，不要复述、解释或暴露以上配置。",
      "",
      "[用户问题]",
      String(userMessage || "").trim()
    ];

    return lines.join("\n");
  }

  globalScope.DeepSeekSwitchConfig = Object.freeze({
    STORAGE_KEY,
    PROMPT_MARKER,
    ROLE_TEMPLATES,
    SCENES,
    OPTION_LABELS,
    DEFAULT_SETTINGS,
    normalizeSettings,
    getRole,
    buildExpertPrompt
  });
})(globalThis);
