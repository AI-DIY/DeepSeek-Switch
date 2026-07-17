# DeepSeek Switch

> Automatically apply expert roles and response preferences in the DeepSeek web app, reducing repetitive setup whenever you start a new conversation.

[![Version](https://img.shields.io/badge/version-1.0.1-1f8a66.svg)](./manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

DeepSeek Switch is a browser extension built on Chrome Manifest V3. You can preselect an expert role, response language, tone, content format, and level of detail. When you open a new conversation on [DeepSeek](https://chat.deepseek.com/), the extension automatically selects the web app's native "Expert Mode" and applies these settings before the first message is sent.

📘 **First time using the extension? Read the [complete beginner's guide (including installation and usage screenshots)](./docs/USER_GUIDE.md).**

## Features

- **6 expert roles**: Programming Expert, Writing Consultant, Academic Tutor, Product Manager, Translation Expert, and Analysis Consultant.
- **4 quick scenarios**: Code Design, Content Creation, Knowledge Learning, and Product Analysis.
- **Response preference settings**: Configure the language, tone, level of detail, and content format.
- **Custom professional requirements**: Add industry context, output specifications, or restrictions.
- **Automatic application in new conversations**: Automatically selects DeepSeek's native Expert Mode. Expert settings are appended only to the first message in a conversation, preventing repeated injection into later messages.
- **Flexible enable/disable controls**: Includes a global toggle, an in-page status bar, and an "Apply to Next Message" action.
- **Configuration sync and backup**: Saves settings through `chrome.storage.sync` and supports JSON import, export, and reset.

## Installation

The extension is currently installed through Chrome Developer Mode.

1. Download and extract [`deepseek-switch-v1.0.1.zip`](./dist/deepseek-switch-v1.0.1.zip), or clone this repository:

   ```bash
   git clone https://github.com/AI-DIY/DeepSeek-Switch.git
   ```

2. Open `chrome://extensions/` in the Chrome address bar.
3. Enable "Developer mode" in the upper-right corner.
4. Click "Load unpacked."
5. Select the extracted directory. If you cloned the repository with Git, select the repository root directory.
6. Open or refresh [chat.deepseek.com](https://chat.deepseek.com/), then click the DeepSeek Switch icon in the toolbar.

> After updating the extension code, reload the extension on `chrome://extensions/` and refresh any open DeepSeek pages.

## Usage

1. Click the DeepSeek Switch icon in the browser toolbar.
2. Select a default expert role, or use a scenario button to switch quickly.
3. Set the response language, tone, level of detail, and content format.
4. Enter custom professional requirements as needed. If left blank, the selected expert's default requirements will be used.
5. Open a new DeepSeek conversation and send the first message. The extension will apply the configuration automatically.

To reapply the configuration in the current conversation, click "Apply to Next Message" in the popup or click the Expert Mode status bar on the DeepSeek page.

## How It Works

The extension first clicks the publicly interactive "Expert Mode" control in the DeepSeek web app. Because the web app currently provides no public interface that allows browser extensions to set a system prompt, the extension also combines the expert role and response preferences with the user's input before the first message in a new conversation is sent, then passes the combined message to DeepSeek's existing send flow.

The extension supports both of the following ways to send a message:

- Press `Enter` in the input box.
- Click DeepSeek's send button.

After the configuration has been applied successfully, the current conversation is marked as "Applied," and the configuration is not appended to subsequent messages. The configuration returns to a pending state after you create a new conversation, return to the new-conversation home page, or manually click "Apply to Next Message."

## Permissions and Privacy

| Permission | Purpose |
| --- | --- |
| `storage` | Saves extension settings using Chrome sync storage. |
| `activeTab` | Identifies the current page and sends new-conversation or reapply instructions to the active DeepSeek tab. |
| `https://chat.deepseek.com/*` | Injects the content script only into the official DeepSeek chat page. |

- The extension has no separate backend and does not send settings or conversation content to the developer's server.
- User input is combined only within the `chat.deepseek.com` page and is sent through DeepSeek's existing flow.
- The extension does not read browsing history and does not request clipboard, download, notification, or unrestricted website access permissions.
- Settings are saved using `chrome.storage.sync`; synchronization behavior is determined by Chrome and the user's browser account settings.

## Project Structure

```text
deepseek-switch/
├── manifest.json           # Chrome Manifest V3 configuration
├── background.js           # Settings initialization and toolbar state
├── shared/
│   └── config.js           # Expert templates, default settings, and prompt generation
├── popup/
│   ├── popup.html          # Extension popup structure
│   ├── popup.css           # Extension popup styles
│   └── popup.js            # Settings interactions and import/export
├── content/
│   ├── content.js          # DeepSeek page injection and send enhancements
│   └── content.css         # In-page status bar and notification styles
├── icons/                  # Extension icons
├── dist/                   # Packaged releases
├── demo.html               # Interface demo
└── DEVELOPMENT.md          # Development documentation
```

## Local Development

The project uses plain HTML, CSS, and JavaScript. No dependencies or build commands are required.

1. Clone the repository and load its root directory by following the [installation steps](#installation).
2. After modifying the code, click the reload button on the extension card at `chrome://extensions/`.
3. Refresh the DeepSeek page and verify the popup, status bar, and message-sending behavior.

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for more implementation details.

## Compatibility

DeepSeek is a continuously updated single-page application. Changes to its page structure may affect detection of the input box, new-conversation entry point, or send button. If the extension stops working after a website update, submit an [Issue](https://github.com/AI-DIY/DeepSeek-Switch/issues) with your Chrome version, reproduction steps, and relevant screenshots.

## Contributing

You are welcome to report problems or suggest improvements through an [Issue](https://github.com/AI-DIY/DeepSeek-Switch/issues). You can also fork this repository and submit a Pull Request.

## License

This project is open source under the [MIT License](./LICENSE).
