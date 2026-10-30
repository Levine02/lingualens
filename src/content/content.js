/**
 * LinguaLens content script
 * 划词 → 判断「单词 / 句子」→ 浮层展示
 * 所有 DOM 挂在 Shadow DOM 下，避免污染宿主页面样式。
 */
(() => {
  if (window.__lingualensLoaded) return;
  window.__lingualensLoaded = true;

  /* ----------------------------- 常量与工具 ----------------------------- */

  const HOST_ID = 'lingualens-host';
  const WORD_RE = /^[\p{L}\p{M}][\p{L}\p{M}'’\-]{0,44}$/u;
  const CN_RE = /[\u4e00-\u9fff]/g;

  let settings = null;
  let host = null;
  let shadow = null;
  let panel = null;
  let currentToken = 0;      // 防止旧的异步结果覆盖新的
  let port = null;
  let lastAnchorText = '';
  let hideTimer = null;

  const STYLE_TEXT = `
:host { all: initial; }
.ll-wrap {
  position: fixed;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ll-fg);
  -webkit-font-smoothing: antialiased;
}
.ll-card {
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: min(70vh, 520px);
  overflow: hidden auto;
  background: var(--ll-bg);
  border: 1px solid var(--ll-border);
  border-radius: 14px;
  box-shadow: 0 12px 34px rgba(15, 23, 42, .22), 0 2px 6px rgba(15, 23, 42, .1);
  backdrop-filter: saturate(1.2) blur(6px);
  animation: ll-pop .13s ease-out;
}
@keyframes ll-pop { from { opacity: 0; transform: translateY(-4px) scale(.99); } to { opacity: 1; transform: none; } }

.ll-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  position: sticky; top: 0;
  background: var(--ll-bg);
  border-bottom: 1px solid var(--ll-border);
}
.ll-word { font-size: 17px; font-weight: 650; letter-spacing: .2px; color: var(--ll-fg-strong); word-break: break-word; flex: 1; }
.ll-sub { font-size: 12.5px; color: var(--ll-muted); }
.ll-spacer { flex: 1; }
.ll-body { padding: 10px 12px 12px; max-height: 420px; overflow: auto; }

.ll-row { margin-bottom: 10px; }
.ll-label { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--ll-muted); margin-bottom: 4px; }
.ll-phonetic { font-size: 15px; font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; color: var(--ll-accent); }
.ll-cn { font-size: 14px; color: var(--ll-fg-strong); }
.ll-cn .pos { display: inline-block; min-width: 30px; color: var(--ll-accent); font-style: italic; margin-right: 6px; }
.ll-sense { margin: 1px 0; }

.ll-pos-block { margin-top: 8px; }
.ll-pos { font-size: 12px; font-weight: 600; color: var(--ll-accent-2); }
.ll-def { display: flex; gap: 6px; margin: 3px 0; }
.ll-def > i { flex: 0 0 auto; color: var(--ll-muted); font-style: normal; }
.ll-en { color: var(--ll-fg); }
.ll-ex { color: var(--ll-muted); font-size: 12.5px; font-style: italic; }

.ll-src { max-height: 88px; overflow: auto; font-size: 12.5px; color: var(--ll-muted); border-left: 3px solid var(--ll-accent-2); padding: 2px 8px; white-space: pre-wrap; word-break: break-word; }
.ll-out { font-size: 14.5px; color: var(--ll-fg-strong); white-space: pre-wrap; word-break: break-word; min-height: 20px; }
.ll-caret { display: inline-block; width: 6px; height: 15px; background: var(--ll-accent); vertical-align: -2px; animation: ll-blink 1s steps(2, start) infinite; }
@keyframes ll-blink { to { visibility: hidden; } }
.ll-err { color: var(--ll-danger); font-size: 13px; white-space: pre-wrap; }
.ll-hint { color: var(--ll-muted); font-size: 12.5px; }

.ll-foot { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--ll-border); position: sticky; bottom: 0; background: var(--ll-bg); }
.ll-btn {
  border: 1px solid var(--ll-border); background: var(--ll-btn); color: var(--ll-fg);
  border-radius: 8px; padding: 4px 10px; font-size: 12.5px; cursor: pointer;
  transition: background .12s, border-color .12s, transform .08s;
}
.ll-btn:hover { background: var(--ll-btn-hover); border-color: var(--ll-accent); }
.ll-btn:active { transform: translateY(1px); }
.ll-btn.primary { background: var(--ll-accent); border-color: var(--ll-accent); color: #fff; }
.ll-btn.primary:hover { filter: brightness(1.06); }
.ll-btn.icon { padding: 4px 8px; }
.ll-close { border: none; background: transparent; color: var(--ll-muted); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 6px; }
.ll-close:hover { background: var(--ll-btn-hover); color: var(--ll-fg); }
.ll-loader { display: inline-flex; gap: 4px; align-items: center; color: var(--ll-muted); font-size: 12.5px; }
.ll-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ll-accent); animation: ll-bounce .9s infinite; }
.ll-dot:nth-child(2) { animation-delay: .15s; }
.ll-dot:nth-child(3) { animation-delay: .3s; }
@keyframes ll-bounce { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.ll-badge { font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--ll-btn); border: 1px solid var(--ll-border); color: var(--ll-muted); }
`;

  const THEMES = {
    light: {
      '--ll-bg': 'rgba(255,255,255,.97)',
      '--ll-fg': '#1f2937',
      '--ll-fg-strong': '#0f172a',
      '--ll-muted': '#6b7280',
      '--ll-border': 'rgba(15,23,42,.12)',
      '--ll-accent': '#2563eb',
      '--ll-accent-2': '#7c3aed',
      '--ll-danger': '#dc2626',
      '--ll-btn': '#f3f4f6',
      '--ll-btn-hover': '#e5e7eb'
    },
    dark: {
      '--ll-bg': 'rgba(24,26,33,.97)',
      '--ll-fg': '#d5d8e0',
      '--ll-fg-strong': '#f2f4f8',
      '--ll-muted': '#8b90a0',
      '--ll-border': 'rgba(255,255,255,.12)',
      '--ll-accent': '#7aa2ff',
      '--ll-accent-2': '#b28cff',
      '--ll-danger': '#f87171',
      '--ll-btn': 'rgba(255,255,255,.08)',
      '--ll-btn-hover': 'rgba(255,255,255,.16)'
    }
  };

  function resolveTheme(mode) {
    if (mode === 'dark' || mode === 'light') return mode;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function h(tag, attrs = {}, kids = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, String(v));
    }
    const arr = Array.isArray(kids) ? kids : [kids];
    for (const kid of arr) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  const svgIcon = (paths, size = 14) => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = '-2px';
    for (const d of paths) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  };

  const ICON = {
    speaker: ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9 9 0 0 1 0 14'],
    copy: ['M9 9h10v10H9z', 'M5 15H4V4h11v1'],
    close: ['M18 6 6 18', 'M6 6l12 12'],
    robot: ['M12 8V4H8', 'M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M9 13h.01', 'M15 13h.01'],
    refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'],
    gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7L4.5 7a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z']
  };

  /* ----------------------------- 浮层容器 ----------------------------- */

  function ensureHost() {
    if (host && host.isConnected) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'open' });
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE_TEXT;
    shadow.appendChild(styleEl);
    (document.body || document.documentElement).appendChild(host);
    return host;
  }

  function applyThemeVars(root) {
    const theme = THEMES[resolveTheme(settings?.theme || 'auto')] || THEMES.light;
    for (const [k, v] of Object.entries(theme)) root.style.setProperty(k, v);
  }

  function buildPanel() {
    ensureHost();
    if (panel) panel.remove();
    const wrap = h('div', { class: 'll-wrap' });
    applyThemeVars(wrap);
    const card = h('div', { class: 'll-card' });
    card.appendChild(h('div', { class: 'll-head' }, [
      h('span', { class: 'll-word', text: lastAnchorText.slice(0, 60) }),
      h('span', { class: 'll-badge', id: 'll-mode' }),
      h('button', { class: 'll-close', title: '关闭 (Esc)', onclick: hide }, [svgIcon(ICON.close, 15)])
    ]));
    const body = h('div', { class: 'll-body', id: 'll-body' });
    const foot = h('div', { class: 'll-foot', id: 'll-foot' });
    card.append(body, foot);
    wrap.appendChild(card);
    shadow.appendChild(wrap);
    panel = wrap;
    return panel;
  }

  const $ = (sel) => panel?.querySelector(sel);

  function setModeBadge(text) {
    const el = $('#ll-mode');
    if (el) el.textContent = text;
  }

  function positionPanel(rect) {
    if (!panel) return;
    const card = panel.querySelector('.ll-card');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    card.style.visibility = 'hidden';
    card.style.maxHeight = 'min(70vh, 520px)';
    const w = card.offsetWidth || 360;
    const pH = card.offsetHeight || 200;
    let left = Math.min(Math.max(8, rect.left), vw - w - 8);
    let top = rect.bottom + 8;
    if (top + pH > vh - 8) {
      const above = rect.top - pH - 8;
      top = above > 8 ? above : Math.max(8, vh - pH - 8);
    }
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    card.style.visibility = '';
  }

  function hide() {
    cancelPort();
    if (panel) { panel.remove(); panel = null; }
    hideTimer = null;
  }

  function cancelPort() {
    currentToken++;
    if (port) {
      try { port.disconnect(); } catch { /* ignore */ }
      port = null;
    }
  }

  /* ----------------------------- 选区检测 ----------------------------- */

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const text = String(sel.toString() || '').trim();
    if (!text || text.length > 2000) return null;
    let rect = null;
    try {
      const range = sel.getRangeAt(0);
      rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) {
        rect = range.getClientRects()[0] || null;
      }
    } catch { /* ignore */ }
    return { text, rect: rect || { left: 40, top: 40, bottom: 60, right: 200 } };
  }

  function decideMode(text, forceMode) {
    if (forceMode === 'word' || forceMode === 'sentence') return forceMode;
    return WORD_RE.test(text) ? 'word' : 'sentence';
  }

  function detectSourceLang(text) {
    const cnCount = (text.match(CN_RE) || []).length;
    return cnCount / Math.max(1, text.length) > 0.25 ? '中文' : '英文';
  }

  let settingsPromise = null;
  function ensureSettings() {
    if (settings) return Promise.resolve(settings);
    if (!settingsPromise) {
      settingsPromise = new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'lingualens:getSettings' }, (res) => {
            settings = res?.ok ? res.settings : { enabled: true, autoShow: true, autoShowDelayMs: 180, sentenceMaxChars: 600, showPhonetic: true, showChineseDict: true, showEnglishDef: true, theme: 'auto' };
            resolve(settings);
          });
        } catch {
          settings = { enabled: true, autoShow: true, autoShowDelayMs: 180, sentenceMaxChars: 600, showPhonetic: true, showChineseDict: true, showEnglishDef: true, theme: 'auto' };
          resolve(settings);
        }
      });
    }
    return settingsPromise;
  }

  let triggerTimer = null;
  function scheduleShow(info, opts = {}) {
    clearTimeout(triggerTimer);
    const delay = opts.immediate ? 0 : Number(settings?.autoShowDelayMs || 180);
    triggerTimer = setTimeout(() => show(info, opts), delay);
  }

  document.addEventListener('mouseup', async (e) => {
    await ensureSettings();
    if (!settings?.enabled) return;
    if (panel && host?.contains(e.target)) return;
    const info = getSelectionInfo();
    if (!info) { if (panel) scheduleHide(); return; }
    // 未开启自动弹窗时，按住 Alt 松开鼠标也能手动触发
    if (!settings.autoShow && !e.altKey) return;
    if (info.text.length > Number(settings.sentenceMaxChars || 600)) return;
    lastAnchorText = info.text;
    scheduleShow(info, { immediate: false });
  }, true);

  document.addEventListener('keyup', async (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!e.shiftKey) return;
    await ensureSettings();
    if (!settings?.enabled || !settings.autoShow) return;
    const info = getSelectionInfo();
    if (!info) return;
    lastAnchorText = info.text;
    scheduleShow(info, { immediate: true });
  }, true);

  document.addEventListener('dblclick', async () => {
    await ensureSettings();
    if (!settings?.enabled || !settings.autoShow) return;
    setTimeout(() => {
      const info = getSelectionInfo();
      if (!info) return;
      if (!WORD_RE.test(info.text)) return;
      lastAnchorText = info.text;
      show(info, { forceMode: 'word' });
    }, 60);
  }, true);

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 260);
  }

  document.addEventListener('mousedown', (e) => {
    if (!panel) return;
    if (host && host.contains(e.target)) return;
    // 浮层内按下时不要立刻消失（方便选中译文里的文字）
    hide();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel) { e.stopPropagation(); hide(); }
  }, true);

  window.addEventListener('scroll', () => { if (panel) hide(); }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'lingualens:trigger') {
      const info = getSelectionInfo();
      if (!info) return;
      lastAnchorText = info.text;
      show(info, { forceMode: msg.forceMode, immediate: true });
    }
    if (msg?.type === 'lingualens:settingsChanged') {
      settings = msg.settings;
    }
  });

  /* ----------------------------- 主流程 ----------------------------- */

  function show(info, opts = {}) {
    if (!settings?.enabled) return;
    const mode = decideMode(info.text, opts.forceMode);
    buildPanel();
    setModeBadge(mode === 'word' ? '词典' : 'AI 翻译');
    positionPanel(info.rect);
    cancelPort();
    const token = currentToken;
    if (mode === 'word') renderWord(info.text, token);
    else renderSentence(info.text, token);
  }

  /* ----------------------------- 单词模式 ----------------------------- */

  function copyText(text, btn) {
    const done = (ok) => {
      const old = btn?.textContent;
      if (btn) btn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(() => { if (btn) btn.textContent = old; }, 1200);
    };
    try {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        done(ok);
      });
    } catch { done(false); }
  }

  function speak(text, lang = 'en-US') {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  function playAudio(url, fallbackText) {
    if (!url) { speak(fallbackText); return; }
    try {
      const audio = new Audio(url);
      audio.play().catch(() => speak(fallbackText));
    } catch {
      speak(fallbackText);
    }
  }

  function loader(text = '查询中') {
    return h('div', { class: 'll-loader' }, [
      h('span', { class: 'll-dot' }), h('span', { class: 'll-dot' }), h('span', { class: 'll-dot' }),
      ` ${text}`
    ]);
  }

  function renderWord(word, token) {
    const body = $('#ll-body');
    const foot = $('#ll-foot');
    body.replaceChildren(loader());
    foot.replaceChildren();

    chrome.runtime.sendMessage({ type: 'lingualens:lookup', word }, (res) => {
      if (token !== currentToken || !panel) return;
      if (!res?.ok) {
        const partial = res?.payload;
        if (partial && (partial.chinese?.length || partial.meanings?.length || partial.phonetic)) {
          paintWord(word, partial, token);
          return;
        }
        body.replaceChildren(h('div', { class: 'll-err', text: res?.error || '查询失败' }));
        foot.replaceChildren(
          h('button', { class: 'll-btn primary', onclick: () => renderExplain(word) }, ['让 AI 解释这个词']),
          h('button', { class: 'll-btn', onclick: openOptions }, [svgIcon(ICON.gear, 13), ' 设置'])
        );
        return;
      }
      paintWord(word, res.data, token);
    });
  }

  function paintWord(word, data, token) {
    const body = $('#ll-body');
    if (!body) return;
    const nodes = [];
    const audios = data.audios || {};
    const meaning = data.meanings || [];

    // 1) 音标 + 发音
    const phoneticTop = data.phonetic || '';
    if (settings.showPhonetic && (phoneticTop || audios.uk || audios.us)) {
      const row = h('div', { class: 'll-row' }, [h('div', { class: 'll-phonetic', text: phoneticTop || word })]);
      const btns = h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } });
      btns.appendChild(h('button', { class: 'll-btn', onclick: () => playAudio(audios.uk, word) }, [svgIcon(ICON.speaker, 13), ' 英音']));
      btns.appendChild(h('button', { class: 'll-btn', onclick: () => playAudio(audios.us, word) }, [svgIcon(ICON.speaker, 13), ' 美音']));
      btns.appendChild(h('button', { class: 'll-btn', onclick: () => speak(word) }, [svgIcon(ICON.speaker, 13), ' TTS']));
      row.appendChild(btns);
      nodes.push(row);
    }

    // 2) 中文释义
    if (settings.showChineseDict && data.chinese?.length) {
      const cn = h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: '中文释义' })]);
      for (const g of data.chinese.slice(0, 6)) {
        const line = h('div', { class: 'll-sense ll-cn' });
        if (g.pos) line.appendChild(h('span', { class: 'pos', text: g.pos }));
        line.appendChild(document.createTextNode(g.senses.join('；')));
        cn.appendChild(line);
      }
      nodes.push(cn);
    }

    // 3) 词形变化
    if (data.forms?.length) {
      const forms = h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: '词形变化' })]);
      const line = h('div', { class: 'll-cn' });
      data.forms.forEach((f, i) => {
        if (i) line.appendChild(document.createTextNode(' · '));
        line.appendChild(h('span', {}, [`${f.name} ${f.value}`]));
      });
      forms.appendChild(line);
      nodes.push(forms);
    }

    // 4) 英文释义
    if (settings.showEnglishDef && meaning.length) {
      const block = h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: '英文释义' })]);
      for (const m of meaning.slice(0, 4)) {
        const mb = h('div', { class: 'll-pos-block' });
        if (m.partOfSpeech) mb.appendChild(h('div', { class: 'll-pos', text: m.partOfSpeech }));
        m.items.slice(0, settings.showExample ? 3 : 2).forEach((d, i) => {
          if (!settings.showExample && i > 1) return;
          mb.appendChild(h('div', { class: 'll-def' }, [
            h('i', { text: `${i + 1}.` }),
            h('div', {}, [
              h('div', { class: 'll-en', text: d.definition }),
              d.example && settings.showExample ? h('div', { class: 'll-ex', text: `"${d.example}"` }) : null
            ])
          ]));
        });
        block.appendChild(mb);
      }
      nodes.push(block);
    }

    if (!nodes.length) nodes.push(h('div', { class: 'll-hint', text: '没有查到释义，试试让 AI 解释。' }));
    body.replaceChildren(...nodes);

    const foot = $('#ll-foot');
    if (foot) {
      const copyBtn = h('button', { class: 'll-btn', onclick: (e) => copyText(word, e.currentTarget) }, [svgIcon(ICON.copy, 13), ' 复制']);
      const aiBtn = h('button', { class: 'll-btn primary', onclick: () => renderExplain(word) }, [svgIcon(ICON.robot, 13), ' AI 详解']);
      const srcBadge = data.sources?.length
        ? h('span', { class: 'll-badge', style: { marginLeft: 'auto', alignSelf: 'center' }, text: data.sources.join(' + ') })
        : null;
      foot.replaceChildren(aiBtn, copyBtn, h('button', { class: 'll-btn', onclick: openOptions }, [svgIcon(ICON.gear, 13), ' 设置']), srcBadge);
    }

    requestAnimationFrame(() => {
      const rect = getSelectionInfo()?.rect;
      if (rect) positionPanel(rect);
    });
  }

  /* ----------------------------- 句子模式 ----------------------------- */

  function renderSentence(text, token) {
    const body = $('#ll-body');
    const foot = $('#ll-foot');
    const source = detectSourceLang(text);

    const src = h('div', { class: 'll-src', text: text.length > 400 ? text.slice(0, 400) + '…' : text });
    const out = h('div', { class: 'll-out' }, [loader('翻译中')]);
    body.replaceChildren(
      h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: '原文' }), src]),
      h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: '译文' }), out])
    );
    const copyBtn = h('button', { class: 'll-btn', onclick: (e) => copyText(out.textContent, e.currentTarget) }, [svgIcon(ICON.copy, 13), ' 复制译文']);
    const retryBtn = h('button', { class: 'll-btn', onclick: () => renderSentence(text, token) }, [svgIcon(ICON.refresh, 13), ' 重试']);
    const setBtn = h('button', { class: 'll-btn', onclick: openOptions }, [svgIcon(ICON.gear, 13), ' 设置']);
    foot.replaceChildren(copyBtn, retryBtn, setBtn);

    startStream({ text, mode: 'sentence', source, out });
  }

  function renderExplain(word) {
    const body = $('#ll-body');
    const foot = $('#ll-foot');
    setModeBadge('AI 详解');
    const out = h('div', { class: 'll-out' }, [loader('思考中')]);
    body.replaceChildren(
      h('div', { class: 'll-row' }, [h('div', { class: 'll-label', text: `AI 详解 · ${word}` }), out])
    );
    const copyBtn = h('button', { class: 'll-btn', onclick: (e) => copyText(out.textContent, e.currentTarget) }, [svgIcon(ICON.copy, 13), ' 复制']);
    const backBtn = h('button', { class: 'll-btn', onclick: () => renderWord(word, currentToken) }, ['返回词典']);
    foot.replaceChildren(backBtn, copyBtn, h('button', { class: 'll-btn', onclick: openOptions }, [svgIcon(ICON.gear, 13), ' 设置']));
    startStream({ text: word, mode: 'explain', source: '英文', out });
  }

  function startStream({ text, mode, source, out }) {
    // 每次开流都生成新 token，旧结果自动作废，避免竞态串台
    const myToken = ++currentToken;
    try { port?.disconnect(); } catch { /* ignore */ }
    port = null;

    const caret = h('span', { class: 'll-caret' });
    out.replaceChildren(caret);
    let acc = '';

    const finish = () => {
      try { port?.disconnect(); } catch { /* ignore */ }
      port = null;
    };

    port = chrome.runtime.connect({ name: 'lingualens:llm' });
    port.onMessage.addListener((msg) => {
      if (myToken !== currentToken || !panel) return;
      if (msg.type === 'delta') {
        acc += msg.text;
        out.textContent = acc;
        out.appendChild(caret);
        const b = $('#ll-body');
        if (b) b.scrollTop = b.scrollHeight;
      } else if (msg.type === 'done') {
        acc = msg.text || acc;
        out.textContent = acc;
        caret.remove();
        finish();
      } else if (msg.type === 'error') {
        caret.remove();
        out.replaceChildren(h('div', { class: 'll-err', text: msg.error || '翻译失败' }));
        const footEl = $('#ll-foot');
        if (footEl && !footEl.querySelector('[data-ll-fix]')) {
          const btn = h('button', { class: 'll-btn primary', 'data-ll-fix': '1', onclick: openOptions }, [svgIcon(ICON.gear, 13), ' 去配置 LLM']);
          footEl.prepend(btn);
        }
        finish();
      }
    });

    port.onDisconnect.addListener(() => { port = null; });

    try {
      port.postMessage({ type: 'start', text, mode, source });
    } catch (e) {
      out.replaceChildren(h('div', { class: 'll-err', text: '连接后台失败：' + String(e?.message || e) }));
    }
  }

  function openOptions() {
    try { chrome.runtime.sendMessage({ type: 'lingualens:openOptions' }); } catch { /* ignore */ }
  }

  /* ----------------------------- 初始化 ----------------------------- */

  chrome.runtime.sendMessage({ type: 'lingualens:getSettings' }, (res) => {
    if (res?.ok) settings = res.settings;
    else settings = null;
  });
})();
