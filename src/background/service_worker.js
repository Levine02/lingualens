/**
 * LinguaLens background service worker
 * 负责：词典查询代理、LLM 调用（含流式）、右键菜单、快捷键转发。
 */
import { getSettings, saveSettings, onSettingsChanged } from '../lib/settings.js';
import { lookupWord } from '../lib/dictionary.js';
import { chatStream, chatOnce, buildTranslateMessages, buildExplainMessages, testConnection, renderTemplate } from '../lib/llm.js';

const CONTEXT_MENU_TRANSLATE = 'lingualens-translate';
const CONTEXT_MENU_WORD = 'lingualens-word';

chrome.runtime.onInstalled.addListener(async (detail) => {
  try {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_TRANSLATE,
      title: '用 LinguaLens 翻译选中内容',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: CONTEXT_MENU_WORD,
      title: '查这个词（音标 / 释义）',
      contexts: ['selection']
    });
  } catch (e) {
    console.warn('[LinguaLens] contextMenus init failed', e);
  }
  if (detail.reason === 'install') {
    // 首次安装：打开设置页引导填写 LLM 配置（词典功能无需配置即可使用）
    chrome.runtime.openOptionsPage?.();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const forceMode = info.menuItemId === CONTEXT_MENU_WORD ? 'word' : 'sentence';
  await nudgeTab(tab.id, forceMode);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'translate-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await nudgeTab(tab.id, 'sentence');
});

/** 通知 content script 立即处理当前选区 */
async function nudgeTab(tabId, forceMode) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'lingualens:trigger', forceMode });
  } catch {
    // 页面还没注入脚本：回退用 scripting 注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/content.js']
      });
      await chrome.tabs.sendMessage(tabId, { type: 'lingualens:trigger', forceMode });
    } catch (e) {
      console.warn('[LinguaLens] cannot reach tab', e);
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { type } = msg || {};

  if (type === 'lingualens:getSettings') {
    getSettings().then((s) => sendResponse({ ok: true, settings: s })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (type === 'lingualens:openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (type === 'lingualens:lookup') {
    lookupWord(msg.word)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => {
        const error = normalizeError(e);
        const payload = e?.payload ? stripEmptyPayload(e.payload) : null;
        sendResponse({ ok: false, error, payload });
      });
    return true;
  }

  if (type === 'lingualens:translate') {
    (async () => {
      try {
        const settings = await getSettings();
        const cfg = settings.llm || {};
        if (!cfg.baseUrl || !cfg.model) throw new Error('请先到设置页填写 LLM 的 Base URL 与模型名');
        if (msg.stream !== false && cfg.stream) {
          sendResponse({ ok: true, stream: true }); // 提示调用方改用 port
          return;
        }
        const messages = msg.mode === 'explain'
          ? buildExplainMessages(msg.text, settings)
          : buildTranslateMessages(msg.text, settings, { source: msg.source || '英文', target: settings.targetLang });
        const text = await chatOnce({ messages, cfg });
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: normalizeError(e) });
      }
    })();
    return true;
  }

  if (type === 'lingualens:testLLM') {
    (async () => {
      try {
        const settings = msg.settings ? { llm: msg.settings } : await getSettings();
        const res = await testConnection(settings);
        sendResponse({ ok: true, ...res });
      } catch (e) {
        sendResponse({ ok: false, error: normalizeError(e) });
      }
    })();
    return true;
  }

  if (type === 'lingualens:saveSettings') {
    saveSettings(msg.patch || {})
      .then((s) => sendResponse({ ok: true, settings: s }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  return undefined;
});

/** 流式翻译长连接 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lingualens:llm') return;
  let controller = null;

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    controller = new AbortController();
    try {
      const settings = await getSettings();
      const cfg = settings.llm || {};
      if (!cfg.baseUrl || !cfg.model) throw new Error('NO_LLM_CONFIG');
      const messages = msg.mode === 'explain'
        ? buildExplainMessages(msg.text, settings)
        : buildTranslateMessages(msg.text, settings, { source: msg.source || '英文', target: settings.targetLang });

      const full = await chatStream({
        messages,
        cfg,
        signal: controller.signal,
        onDelta: (delta) => {
          try {
            port.postMessage({ type: 'delta', text: delta });
          } catch {
            /* port 已断开 */
          }
        }
      });
      try {
        port.postMessage({ type: 'done', text: full });
      } catch { /* ignore */ }
    } catch (e) {
      if (String(e?.message) === 'ABORTED') return;
      try {
        port.postMessage({ type: 'error', error: normalizeError(e) });
      } catch { /* ignore */ }
    }
  });

  port.onDisconnect.addListener(() => {
    try { controller?.abort(); } catch { /* ignore */ }
  });
});

/** 设置变更后实时推送到所有已注入页面，无需刷新网页 */
onSettingsChanged((next) => {
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).then((tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'lingualens:settingsChanged', settings: next })
        .catch(() => { /* 页面未注入脚本，忽略 */ });
    }
  }).catch(() => { /* ignore */ });
});

/** 只有携带有效内容时才回传 partial payload，方便前端降级展示 */
function stripEmptyPayload(payload) {
  if (!payload) return null;
  const has = payload.phonetic ||
    (payload.chinese && payload.chinese.length) ||
    (payload.meanings && payload.meanings.length) ||
    (payload.forms && payload.forms.length);
  return has ? payload : null;
}

function normalizeError(e) {
  const m = String(e?.message || e || '未知错误');
  switch (m) {
    case 'NO_LLM_CONFIG':
      return '尚未配置 LLM：请点击扩展图标 →「打开设置」，填写 Base URL、API Key 和模型名。';
    case 'MODEL_MISSING':
      return '缺少模型名（model），请到设置页填写。';
    case 'BASE_URL_MISSING':
      return '缺少 Base URL，请到设置页填写。';
    case 'TIMEOUT':
      return '请求超时（60s）。可在设置页关闭「流式输出」或换更快的模型。';
    case 'ABORTED':
      return '已取消';
    case 'NOT_A_WORD':
      return '这不是一个可查询的单词。';
    case 'NO_RESULT':
      return '没有查到这个词，试试让 AI 解释它。';
    default:
      if (m.startsWith('NETWORK:')) {
        return '网络请求失败：' + m.slice(8).trim() + '。若是本地模型，请确认服务已启动且放行 localhost 权限。';
      }
      return m;
  }
}

export { renderTemplate };
