import { getSettings, saveSettings, LLM_PRESETS } from '../lib/settings.js';

const $ = (id) => document.getElementById(id);
let settings = null;

function renderLLMState() {
  const llm = settings.llm || {};
  const ready = Boolean(llm.baseUrl && llm.model);
  const preset = LLM_PRESETS.find((p) => p.id === llm.presetId);
  const dot = $('llmDot');
  const state = $('llmState');
  dot.className = 'dot ' + (ready ? 'ok' : 'warn');
  if (ready) {
    const keyOk = Boolean(llm.apiKey);
    state.textContent = `${preset?.name || '自定义'} · ${llm.model}${keyOk ? '' : ' · 未填 Key'}`;
  } else {
    state.textContent = '未配置：打开设置填写 Base URL 与模型';
  }
}

async function triggerTranslate() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'lingualens:trigger', forceMode: null });
    window.close();
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'lingualens:trigger', forceMode: null });
      window.close();
    } catch (e) {
      alert('该页面不支持注入脚本（可能是浏览器内置页或应用商店页面）。');
    }
  }
}

async function main() {
  $('ver').textContent = 'v' + (chrome.runtime.getManifest?.().version || '1.0.0');
  settings = await getSettings();
  $('enabled').checked = Boolean(settings.enabled);
  renderLLMState();

  $('enabled').addEventListener('change', async (e) => {
    settings = await saveSettings({ enabled: e.target.checked });
  });

  $('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-translate').addEventListener('click', triggerTranslate);
}

main();
