import { getSettings, saveSettings, resetSettings, LLM_PRESETS } from '../lib/settings.js';
import { testConnection, buildEndpoint } from '../lib/llm.js';

const $ = (id) => document.getElementById(id);

const FIELDS = [
  'enabled', 'autoShow', 'autoShowDelayMs', 'sentenceMaxChars', 'targetLang', 'theme',
  'showPhonetic', 'showChineseDict', 'showEnglishDef', 'showExample',
  'baseUrl', 'model', 'apiKey', 'temperature', 'maxTokens', 'stream',
  'systemPrompt', 'userTemplate'
];

let current = null;

function fill(settings) {
  current = settings;
  for (const key of FIELDS) {
    const el = $(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(settings[key]);
    else el.value = settings[key] ?? '';
  }
  const llm = settings.llm || {};
  // 这些键在 settings.llm 里，统一从这里取
  for (const key of ['baseUrl', 'model', 'apiKey', 'temperature', 'maxTokens', 'stream', 'systemPrompt', 'userTemplate']) {
    const el = $(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(llm[key]);
    else el.value = llm[key] ?? '';
  }
  const preset = LLM_PRESETS.find((p) => p.id === llm.presetId) || LLM_PRESETS[LLM_PRESETS.length - 1];
  $('llmPreset').value = preset.id;
  $('presetHint').textContent = preset.hint || '';
}

function collect() {
  const g = (id) => $(id);
  const patch = {
    enabled: g('enabled').checked,
    autoShow: g('autoShow').checked,
    autoShowDelayMs: clampInt(g('autoShowDelayMs').value, 0, 2000, 180),
    sentenceMaxChars: clampInt(g('sentenceMaxChars').value, 50, 5000, 600),
    targetLang: g('targetLang').value.trim() || '简体中文',
    theme: g('theme').value,
    showPhonetic: g('showPhonetic').checked,
    showChineseDict: g('showChineseDict').checked,
    showEnglishDef: g('showEnglishDef').checked,
    showExample: g('showExample').checked,
    llm: {
      presetId: g('llmPreset').value,
      baseUrl: g('baseUrl').value.trim(),
      model: g('model').value.trim(),
      apiKey: g('apiKey').value.trim(),
      temperature: Number(g('temperature').value) || 0,
      maxTokens: clampInt(g('maxTokens').value, 64, 8192, 1024),
      stream: g('stream').checked,
      systemPrompt: g('systemPrompt').value,
      userTemplate: g('userTemplate').value
    }
  };
  return patch;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function flash(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.style.color = isError ? 'var(--err)' : 'var(--ok)';
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 2200);
}

async function onSave() {
  const patch = collect();
  current = await saveSettings(patch);
  flash('已保存，已打开的网页即时生效');
}

async function onTest() {
  const patch = collect();
  const btn = $('btn-test');
  const res = $('testResult');
  btn.disabled = true;
  btn.textContent = '测试中…';
  res.className = 'test-result';
  res.textContent = `请求地址：${buildEndpoint(patch.llm.baseUrl) || '(未填写 Base URL)'}`;
  try {
    const out = await testConnection({ llm: patch.llm });
    res.className = 'test-result ok';
    res.textContent = `✅ 连接成功 · ${out.latencyMs}ms · 模型回复："${out.reply}"`;
  } catch (e) {
    res.className = 'test-result err';
    res.textContent = '❌ ' + String(e?.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
  }
}

function bindEvents() {
  $('btn-save').addEventListener('click', onSave);
  $('btn-test').addEventListener('click', onTest);
  $('btn-reset').addEventListener('click', async () => {
    if (!confirm('确定要把所有设置恢复为默认值吗？API Key 也会被清空。')) return;
    current = await resetSettings();
    fill(current);
    flash('已恢复默认');
  });

  $('btn-toggle-key').addEventListener('click', () => {
    const el = $('apiKey');
    const btn = $('btn-toggle-key');
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.textContent = el.type === 'password' ? '显示' : '隐藏';
  });

  $('llmPreset').addEventListener('change', (e) => {
    const preset = LLM_PRESETS.find((p) => p.id === e.target.value);
    if (!preset) return;
    $('presetHint').textContent = preset.hint || '';
    if (preset.baseUrl) $('baseUrl').value = preset.baseUrl;
    if (preset.model) $('model').value = preset.model;
    if (preset.id === 'ollama') $('apiKey').value = 'ollama';
  });

  // 修改任意项后立即标记为未保存状态
  document.addEventListener('input', () => { $('status').textContent = '有未保存的修改'; $('status').style.color = 'var(--muted)'; });
  document.addEventListener('change', () => { $('status').textContent = '有未保存的修改'; $('status').style.color = 'var(--muted)'; });
}

async function main() {
  const presetSelect = $('llmPreset');
  for (const p of LLM_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  }
  const settings = await getSettings();
  fill(settings);
  bindEvents();
}

main();
