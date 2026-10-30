# LinguaLens · 划词词典与 AI 翻译

在网页上选中英文单词，查看音标、发音和中文释义；选中一句话，用你配置的 AI 模型翻译成中文。

**查单词不需要 API Key；AI 句子翻译和「AI 详解」需要配置模型服务。** 没有 API Key 的用户，可以从下方的智谱 GLM 免费模型配置开始。

| 选中的内容 | 可以做什么 |
| --- | --- |
| 单个英文单词 / 短语 | 查看音标、英音 / 美音、中文释义、词形变化和英文释义 |
| 句子 / 段落 | 使用 AI 翻译，支持流式输出 |
| 词典未收录的单词 | 点击「AI 详解」，查看释义、搭配和例句 |

## 1. 下载插件

推荐下载 **`lingualens-1.0.0-chrome.zip`**，直接拖进 Chrome 扩展管理页安装，**不需要手动解压、安装 Git 或 Node.js，也不需要编译**。

| 平台 | 仓库 | 下载方式 |
| --- | --- | --- |
| GitHub（推荐） | [Levine02/lingualens](https://github.com/Levine02/lingualens) | 打开 [Releases](https://github.com/Levine02/lingualens/releases)，在 `v1.0.0` 的 Assets 中下载 **`lingualens-1.0.0-chrome.zip`** |

**[点击下载可直接拖拽安装的 ZIP](https://github.com/Levine02/lingualens/releases/download/v1.0.0/lingualens-1.0.0-chrome.zip)**

GitHub 仓库和安装包公开可下载。GitLab 仓库需要登录有访问权限的账号，并能够访问 `git.garena.com`。

## 2. 添加到 Chrome

### 推荐：直接拖拽 ZIP 安装

1. 下载上面的 **`lingualens-1.0.0-chrome.zip`**，不用解压。
2. 在 Chrome 地址栏输入 `chrome://extensions`，按回车。
3. 打开右上角的 **开发者模式**。
4. 从文件管理器（Windows 资源管理器 / macOS Finder）把 ZIP **拖进这个扩展管理页面**，松开鼠标；如出现确认提示，按提示完成安装。
5. 看到 **LinguaLens · 划词词典与 AI 翻译** 卡片，确认开关处于启用状态。
6. 刷新原来已打开的普通网页，选中一个英文单词试试。

Chrome 会自动解压并加载扩展。这里是拖进 `chrome://extensions` 页面，不是双击 ZIP，也不是在「加载已解压的扩展程序」按钮中选择 ZIP。

安装后可点击工具栏的拼图图标，找到 LinguaLens，点击图钉固定到工具栏。

首次安装会自动打开设置页。暂时没有 API Key 也没关系，词典功能可以先用。

### 备用：手动解压加载

如果拖拽安装不可用，或者你下载的是 GitHub **Code → Download ZIP**、GitLab 源码 ZIP、旧的 `lingualens-1.0.0.zip`，使用以下方式：

1. 将 ZIP 完整解压，放到一个长期保留的位置。
2. 打开 `chrome://extensions` 并开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择直接包含 `manifest.json`、`src` 和 `icons` 的文件夹。
4. 刷新网页。使用这种方式安装后，请保留加载的文件夹。

源码 ZIP 通常多包了一层项目文件夹；专用的 `-chrome.zip` 将 `manifest.json` 放在 ZIP 根目录，因此可以直接拖拽安装。

> 若浏览器由单位统一管理且禁止开发者模式或扩展安装，需要联系浏览器管理员。

## 3. 没有 API Key？推荐智谱 GLM 免费模型

API Key 是模型服务商发给你的调用凭证。免费模型也需要自己的 API Key；插件不内置或共享任何人的 Key。

### 第一步：注册并获取 API Key

1. 打开 [智谱开放平台 bigmodel.cn](https://bigmodel.cn/)，注册或登录自己的账号。
2. 进入 **控制台 / 个人中心 → API Keys**，也可以打开 [API Keys 管理页](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)。
3. 按平台提示创建并复制 **模型标准 API** 的 Key。平台若要求完成账号验证或开通模型访问，请按控制台提示操作。
4. 保管好 Key，稍后粘贴到插件设置中。不要把 Key 发给别人，也不要写进源码、截图或公开仓库。

这里使用的是标准模型 API 接口。智谱当前区分模型标准 API、个人套餐和团队套餐的 Key，请选与标准 API 对应的类型；不需要为这份配置购买 Coding Plan。

### 第二步：填写插件设置

点击 Chrome 工具栏的 **LinguaLens 图标 → 打开设置**，找到 **LLM（句子翻译）**，按以下内容填写：

| 设置项 | 填写内容 |
| --- | --- |
| 服务商预设 | **智谱 GLM** |
| Base URL | `https://open.bigmodel.cn/api/paas/v4` |
| 模型名 | `glm-4-flash`（插件预设值，先测试账号是否可用；免费型号核对说明见下方） |
| API Key | 粘贴你刚刚在智谱控制台创建的 Key |
| 流式输出 | 建议保持开启 |

选择 **智谱 GLM** 后，插件会自动填入 Base URL 和模型名。API Key 只填 Key 本身，不加引号，不加 `Bearer ` 前缀。Base URL 不需要手动添加 `/chat/completions`。

**免费型号核对（2026 年 10 月 30 日）：** 智谱官方价格表和模型概览明确列出 `GLM-4-Flash-250414` 为免费文本模型；当前价格表未单独列出插件预设的 `glm-4-flash`，因此不承诺这个名称对所有新账号都可用。如果预设名不可用，可在控制台确认权限后，将「模型名」改为 `glm-4-flash-250414` 再测试。免费范围、调用频率和可用型号以你的控制台及官方说明为准。

参考：[智谱 API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing) · [模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview) · [注册与获取 Key 官方说明](https://docs.bigmodel.cn/cn/guide/start/quick-start)。

### 第三步：测试并保存

1. 点击 **测试连接**，等待出现「连接成功」及模型回复；正常情况下会回复 `OK`。
2. **点击设置页右上角的「保存」**，看到「已保存」提示。
3. 回到普通网页，选中一句英文，确认出现中文译文。

**「测试连接」不会保存配置；修改设置后也不会自动保存。** 测试通过后仍需点击「保存」。保存后，已加载插件的网页会接收新设置。

测试连接会向所选服务商发送一次简短请求，按该模型的规则计费或使用免费额度。

## 4. 已经有其他服务商的 API Key

在设置中选择对应的「服务商预设」，核对 Base URL、模型名并粘贴该平台的 API Key，然后 **测试连接 → 保存**。

插件内置 OpenAI、DeepSeek、硅基流动、Moonshot、阿里通义兼容模式、智谱 GLM、本地 Ollama 和自定义接口。使用其他服务商时，请以对应平台控制台中的可用模型和价格为准。

- **自定义网关**：选择「自定义」，填写兼容 OpenAI Chat Completions 的 Base URL、模型名和 Key。
- **本地 Ollama**：先运行本地服务并准备好模型；插件预设地址为 `http://localhost:11434/v1`，API Key 填 `ollama`，模型名改成你本地已经安装的模型。

切换服务商时，请同时检查 API Key 是否属于新服务商。

## 5. 日常怎么用

| 操作 | 效果 |
| --- | --- |
| 选中英文单词或短语后松开鼠标 | 自动弹出词典卡片 |
| 双击英文单词 | 查看这个词的解释 |
| 选中一句话或一段文字 | 调用配置的模型进行 AI 翻译 |
| 点击词典卡片中的「AI 详解」 | 用 AI 解释该单词或短语，需要模型配置 |
| 选中文本后按 `Alt + Q` | 手动触发；macOS 的 `Alt` 对应 `Option` 键 |
| 选中文本后点击右键菜单 | 选择「LinguaLens 翻译选中内容」或「查这个词」 |
| 按 `Esc` 或点击页面其他位置 | 关闭浮层 |

如果不想每次选中文本都弹窗：进入设置，关闭 **选中文本后自动弹出** 并保存，之后使用快捷键或右键菜单触发。也可以按住 `Alt` 再松开鼠标触发。

默认自动翻译上限为 **600 个字符**；超过上限时请用快捷键或右键菜单手动触发。目标语言、弹窗延迟、浅色 / 深色主题、词典显示项及提示词都可以在设置中修改。

## 6. 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 拖拽 ZIP 后无法安装或提示清单文件缺失 | 确认下载的是 `lingualens-1.0.0-chrome.zip`，已开启开发者模式，并拖进 `chrome://extensions`；源码 ZIP 请按备用方式解压加载 |
| 手动加载时提示清单文件缺失 | 选择直接包含 `manifest.json` 的文件夹，不要选择它的上一级目录或 `src` 子目录 |
| 已安装但划词没有反应 | 刷新网页；检查扩展开关和「选中文本后自动弹出」设置；在普通 HTTP / HTTPS 网页上测试 |
| 在 `chrome://`、Chrome 应用商店或部分内嵌页面中无效 | 浏览器内部页面和应用商店限制扩展注入；当前版本也不自动注入网页中的 iframe |
| 单词能查，句子不能翻译 | 词典不依赖 Key，句子翻译依赖模型；检查模型配置是否测试成功并已保存 |
| 测试成功，回到网页仍提示未配置 | 回到设置点击「保存」；「测试连接」只测试当前输入，不会保存 |
| HTTP 401 / 403 | 检查 Key 是否完整、是否属于所选服务商，以及账号是否有该模型的调用权限 |
| HTTP 404 或提示模型不存在 | 核对 Base URL 和模型名；使用 GLM 时参照免费型号核对说明，并以控制台可用列表为准 |
| HTTP 429 | 请求过于频繁或账号额度受限，稍后重试并查看服务商控制台 |
| 网络错误 / 超时 | 检查能否访问所选 Base URL；本地模型需确认服务已启动及跨域、浏览器本地网络权限设置 |
| `Alt + Q` 没有反应 | 在 `chrome://extensions/shortcuts` 中检查或修改快捷键 |
| 下载链接显示 404 | 确认登录了有仓库权限的账号；GitLab 还需满足该站点的网络访问条件 |

## 7. 更新与卸载

**拖拽安装后的更新：** 下载新版专用 ZIP，按拖拽方式安装新版。不要假定重新拖入 ZIP 会原位更新；如果出现两个 LinguaLens 卡片，确认新版配置可用后移除旧版，避免重复弹窗。重新安装前请妥善保管自己的 API Key。

**手动加载后的更新：** 下载新版并解压，将内容更新到原来加载的插件文件夹中；打开 `chrome://extensions`，点击 LinguaLens 卡片上的重新加载按钮，再刷新网页。保留原加载路径，避免因换目录导致扩展身份或本地设置变化。

**卸载：** 在 `chrome://extensions` 中找到 LinguaLens，点击「移除」。重新安装前请自行妥善保管 API Key。

## 8. 权限与数据说明

- API Key 和设置保存在当前浏览器的 `chrome.storage.local`，不使用 Chrome 跨设备同步。
- 查词时，选中的单词或短语会发送给有道及 `dictionaryapi.dev`；播放发音时会访问对应音频地址。
- AI 翻译和「AI 详解」会把选中的文本发送到你配置的模型服务地址，并使用你的 API Key。
- 扩展需要在网页中检测选区、显示浮层，也需要访问你填写的模型接口，因此声明了 HTTP / HTTPS 网站访问权限。
- 当前代码不包含开发者自建的文本收集或统计服务。请只配置你信任的服务商和网关。


安装步骤参考 [Chrome 官方：加载已解压的扩展程序](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

ZIP 拖拽安装实现参考 Chromium 的 [拖拽文件处理](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/api/developer_private/developer_private_functions.cc) 与 [ZIP 安装器](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/browser/zipfile_installer.cc)。
