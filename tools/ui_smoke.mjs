// 运行：npm i jsdom && node tools/ui_smoke.mjs
/**
 * content.js 浮层 UI 冒烟测试（jsdom + stub chrome API）
 * 验证：单词模式渲染、句子模式渲染、重复划词不叠加、Esc 关闭
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const EXT = process.env.LL_EXT || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const code = fs.readFileSync(EXT + '/src/content/content.js', 'utf-8');

const dom = new JSDOM('<!DOCTYPE html><html><body><p id="host-p">placeholder text here</p></body></html>', {
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  url: 'https://example.com/'
});
const { window: win } = dom;
const doc = win.document;

const SETTINGS = {
  enabled: true, autoShow: true, autoShowDelayMs: 0, sentenceMaxChars: 600,
  showPhonetic: true, showChineseDict: true, showEnglishDef: true, showExample: false,
  theme: 'light', targetLang: '简体中文'
};

const calls = [];
let lookupResult = null;
const portMsgs = [];

win.chrome = {
  runtime: {
    sendMessage: (msg, cb) => {
      calls.push(msg.type);
      if (msg.type === 'lingualens:getSettings') cb({ ok: true, settings: SETTINGS });
      else if (msg.type === 'lingualens:lookup') {
        cb(lookupResult ?? { ok: false, error: 'NO_RESULT', payload: { chinese: [], meanings: [], phonetic: '' } });
      }
      return Promise.resolve();
    },
    connect: () => ({
      postMessage: (m) => { portMsgs.push(m.type + ':' + (m.mode || '')); },
      disconnect() {},
      onMessage: { addListener() {} },
      onDisconnect: { addListener() {} }
    }),
    onMessage: { addListener() {} },
    getManifest: () => ({ version: '1.0.0' })
  }
};

win.eval(code);
await new Promise((r) => win.setTimeout(r, 250));

function selectText(text) {
  const p = doc.getElementById('host-p');
  p.textContent = text;
  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function panelText() {
  const host = doc.getElementById('lingualens-host');
  if (!host) return null;
  const card = host.shadowRoot.querySelector('.ll-card');
  return (card?.textContent || '').replace(/\s+/g, ' ').trim();
}

function cardCount() {
  const host = doc.getElementById('lingualens-host');
  return host ? host.shadowRoot.querySelectorAll('.ll-card').length : 0;
}

async function trigger(name, expect) {
  selectText(name);
  doc.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
  await new Promise((r) => win.setTimeout(r, 250));
  return expect || null;
}

let failed = 0;
const assert = (cond, label, extra = '') => {
  console.log((cond ? '✅ ' : '❌ ') + label + (extra ? '  → ' + extra : ''));
  if (!cond) failed++;
};

/* ---------- Case 1: 单词模式 ---------- */
lookupResult = {
  ok: true,
  data: {
    word: 'serendipity',
    phonetic: '/ˌsɛrənˈdɪpɪti/',
    audios: { uk: 'https://x/uk.mp3', us: 'https://x/us.mp3' },
    chinese: [{ pos: 'n.', senses: ['意外发现美好事物的运气'] }],
    forms: [{ name: '复数', value: 'serendipities' }],
    meanings: [{ partOfSpeech: 'noun', items: [{ definition: 'A combination of events...', example: 'e.g. x' }] }],
    sources: ['有道', 'dictionaryapi.dev']
  }
};
await trigger('Serendipity');
let t = panelText();
console.log('\n[单词模式浮层内容]\n' + (t || '(无)'));
assert(t !== null, '浮层已创建');
assert(/Serendipity/.test(t || ''), '显示选中词');
assert(/ˌsɛrənˈdɪpɪti/.test(t || ''), '显示音标');
assert(/意外发现美好事物的运气/.test(t || ''), '显示中文释义');
assert(/serendipities/.test(t || ''), '显示词形变化');
assert(/A combination of events/.test(t || ''), '显示英文释义');
assert(!/e\.g\. x/.test(t || ''), 'showExample=false 时隐藏例句');
assert(/有道 \+ dictionaryapi.dev/.test(t || ''), '显示数据来源');

/* ---------- Case 2: 再划一次不叠加 ---------- */
await trigger('Grace');
await trigger('Serendipity');
assert(cardCount() === 1, '重复划词只有一个浮层', 'count=' + cardCount());

/* ---------- Case 3: 查不到 → AI 兜底提示 ---------- */
lookupResult = { ok: false, error: 'NO_RESULT', payload: { chinese: [], meanings: [], phonetic: '' } };
await trigger('Zzznotaword');
t = panelText();
console.log('\n[未收录词浮层]\n' + (t || '(无)'));
assert(/没有查到|AI|失败/.test(t || ''), '未收录时给出 AI 解释入口');

/* ---------- Case 4: 句子 → LLM ---------- */
portMsgs.length = 0;
await trigger('Serendipity is a beautiful word in the English language.');
await new Promise((r) => win.setTimeout(r, 250));
t = panelText();
console.log('\n[句子模式浮层]\n' + (t || '(无)'));
assert(portMsgs.includes('start:sentence'), '句子模式建立 LLM 连接', portMsgs.join(','));

/* ---------- Case 5: Esc 关闭 ---------- */
doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await new Promise((r) => win.setTimeout(r, 250));
assert(cardCount() === 0, 'Esc 后移除浮层');

console.log('\n' + (failed ? `❌ ${failed} 项失败` : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
