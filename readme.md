# DeepSeek Switch

> 为 DeepSeek 网页端自动应用专家角色与回答偏好，减少每次新建会话时的重复设置。

[![Version](https://img.shields.io/badge/version-1.0.1-1f8a66.svg)](./manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

DeepSeek Switch 是一款基于 Chrome Manifest V3 的浏览器扩展。你可以预先选择专家角色、回答语言、表达语气、内容格式和详略程度；进入 [DeepSeek](https://chat.deepseek.com/) 新会话后，扩展会自动选择网页原生“专家模式”，并在首条消息发送前应用这些配置。

📘 **第一次使用？请查看[完整新手使用手册（含安装与操作截图）](./docs/USER_GUIDE.md)。**

## 功能特性

- **6 种专家角色**：编程专家、写作顾问、学术导师、产品经理、翻译专家和分析顾问。
- **4 种场景快选**：代码设计、文案创作、知识学习和产品分析。
- **回答偏好配置**：支持设置语言、语气、详略程度和内容格式。
- **自定义专业要求**：可以补充行业背景、输出规范或禁止事项。
- **新会话自动应用**：自动选择 DeepSeek 原生专家模式；专家配置仅附加到会话首条消息，避免后续消息重复注入。
- **灵活启停**：支持全局开关、页面状态条以及“应用到下一条”操作。
- **配置同步与备份**：通过 `chrome.storage.sync` 保存配置，并支持 JSON 导入、导出和重置。

## 安装

扩展目前通过 Chrome 开发者模式安装。

1. 下载并解压 [`deepseek-switch-v1.0.1.zip`](./dist/deepseek-switch-v1.0.1.zip)，或克隆本仓库：

   ```bash
   git clone https://github.com/AI-DIY/DeepSeek-Switch.git
   ```

2. 在 Chrome 地址栏打开 `chrome://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压后的目录；如果使用 Git 克隆，请选择仓库根目录。
6. 打开或刷新 [chat.deepseek.com](https://chat.deepseek.com/)，然后点击工具栏中的 DeepSeek Switch 图标。

> 更新扩展代码后，需要在 `chrome://extensions/` 中重新加载扩展，并刷新已打开的 DeepSeek 页面。

## 使用方法

1. 点击浏览器工具栏中的 DeepSeek Switch 图标。
2. 选择默认专家身份，或使用场景按钮快速切换。
3. 设置回答语言、表达语气、详略程度和内容格式。
4. 按需填写自定义专业要求；留空时使用所选专家的默认要求。
5. 打开一个 DeepSeek 新会话并发送首条消息，扩展会自动应用配置。

如果需要在当前会话中重新应用配置，可以点击弹窗中的“应用到下一条”，或点击 DeepSeek 页面上的专家模式状态条。

## 工作原理

扩展会先点击 DeepSeek 网页端公开可交互的“专家模式”控件。由于网页目前没有供浏览器扩展写入系统提示词的公开接口，本扩展还会在新会话的第一条消息发送前，将专家角色和回答偏好与用户输入组合，再交给 DeepSeek 原有的发送流程。

扩展同时支持以下两种发送方式：

- 在输入框中按 `Enter` 发送。
- 点击 DeepSeek 的发送按钮。

配置成功应用后，当前会话会被标记为“已应用”，后续消息不会重复附加配置。新建会话、返回新会话首页或手动点击“应用到下一条”后，配置会重新进入待应用状态。

## 权限与隐私

| 权限 | 用途 |
| --- | --- |
| `storage` | 使用 Chrome 同步存储保存扩展配置。 |
| `activeTab` | 识别当前页面，并向当前 DeepSeek 标签页发送新会话或重新应用指令。 |
| `https://chat.deepseek.com/*` | 仅在 DeepSeek 官方聊天页面注入内容脚本。 |

- 扩展没有独立后端，不会将配置或对话内容发送到开发者服务器。
- 用户输入只在 `chat.deepseek.com` 页面内进行组合，并通过 DeepSeek 原有流程发送。
- 扩展不读取浏览历史，也不申请剪贴板、下载、通知或任意网站访问权限。
- 配置使用 `chrome.storage.sync` 保存，其同步行为由 Chrome 和用户的浏览器账号设置决定。

## 项目结构

```text
deepseek-switch/
├── manifest.json           # Chrome Manifest V3 配置
├── background.js           # 设置初始化与工具栏状态
├── shared/
│   └── config.js           # 专家模板、默认设置与提示词生成
├── popup/
│   ├── popup.html          # 扩展弹窗结构
│   ├── popup.css           # 扩展弹窗样式
│   └── popup.js            # 配置交互与导入导出
├── content/
│   ├── content.js          # DeepSeek 页面注入与发送增强
│   └── content.css         # 页面状态条与提示样式
├── icons/                  # 扩展图标
├── dist/                   # 打包版本
├── demo.html               # 界面演示
└── DEVELOPMENT.md          # 开发说明
```

## 本地开发

项目使用原生 HTML、CSS 和 JavaScript，无需安装依赖或执行构建命令。

1. 克隆仓库并按照[安装步骤](#安装)加载仓库根目录。
2. 修改代码后，在 `chrome://extensions/` 中点击扩展卡片上的刷新按钮。
3. 刷新 DeepSeek 页面，验证弹窗、状态条和消息发送行为。

更多实现细节请参阅 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## 兼容性

DeepSeek 是持续更新的单页应用，页面结构变化可能影响输入框、新会话入口或发送按钮的识别。如果扩展因网页改版失效，请提交 [Issue](https://github.com/AI-DIY/DeepSeek-Switch/issues)，并附上 Chrome 版本、复现步骤和相关截图。

## 参与贡献

欢迎通过 [Issue](https://github.com/AI-DIY/DeepSeek-Switch/issues) 报告问题或提出建议，也欢迎 Fork 本仓库并提交 Pull Request。

## 开源许可

本项目基于 [MIT License](./LICENSE) 开源。
