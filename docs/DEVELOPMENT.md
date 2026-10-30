# LinguaLens 开发说明

用户安装与 API Key 配置请看 [README](../README.md)。

## 目录结构

```text
lingualens/
├── manifest.json                      扩展清单（Manifest V3）
├── README.md                          用户下载、安装与配置指南
├── docs/DEVELOPMENT.md                 开发说明
├── icons/                             16/32/48/128 图标
│   └── generate_icons.py              纯标准库图标生成脚本
├── src/
│   ├── background/service_worker.js   消息路由、流式响应、右键菜单、快捷键
│   ├── content/content.js             划词检测与 Shadow DOM 浮层
│   ├── lib/dictionary.js              多源词典查询与缓存
│   ├── lib/llm.js                     OpenAI 兼容接口、SSE 解析与错误提示
│   ├── lib/settings.js                本地配置与服务商预设
│   ├── options/                       设置页
│   └── popup/                         工具栏弹窗
└── tools/
    ├── check.py                       引用路径与内联脚本 CSP 检查
    └── ui_smoke.mjs                   jsdom 浮层冒烟测试
```

## 请求流程

```text
网页选中文本
  -> content.js 判断单词 / 句子
     -> runtime.sendMessage('lingualens:lookup')
        -> service worker -> dictionary.js -> 有道 + dictionaryapi.dev
     -> runtime.connect('lingualens:llm')
        -> service worker -> llm.js -> 模型接口
        -> SSE 增量 -> Port 消息 -> 浮层累积渲染
```

- 浮层使用 Shadow DOM 和 `:host { all: initial }`，减少页面样式对卡片的影响。
- 流式响应通过 Port 长连接回传，支持逐段渲染。
- 每次打开流时使用递增标识，丢弃旧请求回调，避免连续划词时响应串台。
- 关闭浮层会断开 Port，并通过 `AbortController` 取消未完成的模型请求。
- 词典聚合有道与 `dictionaryapi.dev`，支持音标、发音、中文释义、词形和英文释义；查询结果带缓存。
- 设置保存在 `chrome.storage.local`。设置页需要显式点击「保存」，随后后台向已加载插件的网页广播配置变更。

## 提示词

设置页允许修改 System Prompt 和用户消息模板，用户模板支持：

| 变量 | 含义 |
| --- | --- |
| `{{text}}` | 选中的原文 |
| `{{target}}` | 目标语言 |
| `{{source}}` | 源语言 |

## 自检

```bash
python3 tools/check.py
npm install --no-save --package-lock=false jsdom
node tools/ui_smoke.mjs
python3 icons/generate_icons.py
```

`tools/ui_smoke.mjs` 使用模拟 Chrome API，覆盖单词卡片、句子翻译触发、未收录词兜底、浮层去重和 Esc 关闭。它不验证真实浏览器扩展权限或真实模型 API 的可用性。

发布时应排除 `node_modules`、本地密钥、日志和生成的压缩包。API Key 由用户在浏览器中填写，不应提交到仓库。

## 生成可拖拽安装的 ZIP

`manifest.json` 必须位于 ZIP 根目录，不能额外添加项目目录前缀：

```bash
mkdir -p dist
git archive --format=zip --output=dist/lingualens-1.0.0-chrome.zip v1.0.0 manifest.json src icons
```

这个安装包只包含扩展运行目录和图标目录。GitHub / GitLab 自动生成的源码 ZIP 会带项目目录前缀，应保留为手动解压加载方式，不要把它们当作直接拖拽安装包。
