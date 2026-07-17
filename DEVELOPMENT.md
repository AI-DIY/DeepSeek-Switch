# DeepSeek Switch 开发说明

本目录已经按照 `readme.md` 的产品设计和 `demo.html` 的交互效果，实现为可直接加载的 Chrome Manifest V3 扩展。

## 已实现功能

- 自动专家模式总开关与浏览器工具栏 `ON` 状态。
- 编程专家、写作顾问、学术导师、产品经理、翻译专家、分析顾问六种角色模板。
- 代码设计、文案创作、知识学习、产品分析四种场景快选。
- 回答语言、表达语气、详略程度和内容格式配置。
- 自定义专业要求，留空时自动使用专家模板的默认要求。
- 进入 DeepSeek 新会话时自动准备配置。
- 自动选择 DeepSeek 页面原生的“专家模式”，并在页面异步渲染或新建会话后重试确认。
- 新建会话后自动恢复配置，支持在当前会话手动“应用到下一条”。
- DeepSeek 页面状态条，可查看待应用/已应用状态并快速暂停或启用。
- 设置通过 `chrome.storage.sync` 自动保存，并支持 JSON 导入、导出和恢复默认值。

## 工作方式

插件会先通过 DeepSeek 页面公开可交互的“专家模式”控件完成模式切换。由于网页目前没有供浏览器扩展写入“系统提示词”的公开接口，插件仍会在新会话的第一条消息发送前，将专家角色和回答偏好与用户问题组合成一条完整消息，再交给 DeepSeek 原有发送流程。

配置只在浏览器本地/Chrome 同步存储中保存，不会发送到第三方服务器。用户输入仅在 `chat.deepseek.com` 页面内处理。

插件会监听以下两种发送方式：

- 在输入框按 `Enter` 发送。
- 点击 DeepSeek 的发送按钮。

发送成功后，当前会话会标记为“已应用”，后续消息不会重复附加配置。用户新建会话、刷新到新会话首页或点击“应用到下一条”时，状态会重新变为“待应用”。

## 本地安装

1. 打开 Chrome，在地址栏输入 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录：`D:\development\Project\deepseek-switch`。
5. 打开或刷新 `https://chat.deepseek.com/`。
6. 点击浏览器工具栏中的 DeepSeek Switch 图标进行配置。

修改代码后，在 `chrome://extensions/` 中点击扩展卡片上的刷新按钮，并刷新 DeepSeek 页面即可看到最新效果。

## 目录结构

```text
deepseek-switch/
├─ manifest.json           # Manifest V3 清单
├─ background.js           # 初始化设置、工具栏角标
├─ shared/config.js        # 角色模板、默认设置、提示词生成
├─ popup/
│  ├─ popup.html           # 扩展弹窗
│  ├─ popup.css
│  └─ popup.js
├─ content/
│  ├─ content.js           # DeepSeek 页面注入与发送增强
│  └─ content.css          # 页面状态条和提示样式
└─ icons/                  # 扩展图标
```

## 权限说明

- `storage`：保存并同步用户配置。
- `activeTab`：弹窗打开时识别当前页面，并向当前 DeepSeek 标签页发送“新对话/下条应用”指令。
- `https://chat.deepseek.com/*`：只在 DeepSeek 官方聊天页面注入内容脚本。

扩展不读取浏览历史，不请求剪贴板、下载、通知或任意网站访问权限。

## 兼容性说明

DeepSeek 页面属于持续更新的单页应用。内容脚本使用多组语义选择器定位输入框、新对话入口和发送按钮，并通过 URL 变化识别会话切换。如果 DeepSeek 后续完全改变页面结构，优先调整 `content/content.js` 中的 `COMPOSER_SELECTORS`、`findSendButton` 和 `findNewChatControl`。
