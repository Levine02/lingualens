/**
 * LLM 调用层：面向任何 OpenAI 兼容的 /chat/completions 接口
 * 支持流式（SSE）与非流式两种模式。
 */

/** 把用户填的 baseUrl 归一成完整的 chat completions 地址 */
export function buildEndpoint(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v\d+$/.test(base)) return base + '/chat/completions';
  // 常见厂商兼容根路径，补 /v1
  const needsV1 = /(api\.(openai|deepseek|moonshot|siliconflow)\.com|api\.bigmodel\.cn|api\.zhipu\.ai|open\.bigmodel\.cn|dashscope\.(aliyuncs|ae)\.com|api\.qwen\.ai|api\.glm\.ai)$/i.test(base)
    || /^https?:\/\/[^\/]+$/.test(base);
  if (needsV1) return base + '/v1/chat/completions';
  return base + '/chat/completions';
}

export function renderTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

function friendlyHttpError(status, bodyText) {
  const brief = String(bodyText || '').slice(0, 300);
  switch (status) {
    case 401:
    case 403:
      return `API Key 无效或没有权限（HTTP ${status}）。${brief}`;
    case 404:
      return `接口或模型不存在，请检查 Base URL 与模型名（HTTP ${status}）。${brief}`;
    case 429:
      return `请求被限流或额度不足（HTTP ${status}）。${brief}`;
    case 500:
    case 502:
    case 503:
      return `服务端异常（HTTP ${status}），稍后重试。${brief}`;
    default:
      return `请求失败（HTTP ${status}）。${brief}`;
  }
}

/** 统一的请求体组装 */
function buildRequestPayload(messages, cfg, extra = {}) {
  return {
    model: cfg.model,
    messages,
    temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.3,
    max_tokens: Number(cfg.maxTokens) || 1024,
    ...extra
  };
}

/**
 * 流式聊天
 * @param {Object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {Object} opts.cfg  settings.llm
 * @param {AbortSignal} [opts.signal]
 * @param {(delta:string)=>void} [opts.onDelta]
 * @returns {Promise<string>} 完整文本
 */
export async function chatStream({ messages, cfg, signal, onDelta, timeoutMs = 60000 }) {
  const endpoint = buildEndpoint(cfg.baseUrl);
  if (!endpoint) throw new Error('BASE_URL_MISSING');
  if (!cfg.model) throw new Error('MODEL_MISSING');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('TIMEOUT')), timeoutMs);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey || ''}`
      },
      body: JSON.stringify(buildRequestPayload(messages, cfg, { stream: true }))
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error(ctrl.signal.reason?.message === 'TIMEOUT' ? 'TIMEOUT' : 'ABORTED');
    throw new Error('NETWORK: ' + (e.message || e));
  }

  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new Error(friendlyHttpError(res.status, text));
  }
  if (!res.body) {
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content ?? '';
    onDelta?.(content);
    return content;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? '';
        if (delta) {
          full += delta;
          onDelta?.(delta);
        }
      }
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('ABORTED');
    if (full) return full; // 已经拿到了大部分内容就优雅收尾
    throw e;
  } finally {
    clearTimeout(timer);
  }
  return full;
}

/** 非流式聊天 */
export async function chatOnce({ messages, cfg, signal, timeoutMs = 60000 }) {
  const endpoint = buildEndpoint(cfg.baseUrl);
  if (!endpoint) throw new Error('BASE_URL_MISSING');
  if (!cfg.model) throw new Error('MODEL_MISSING');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey || ''}`
      },
      body: JSON.stringify(buildRequestPayload(messages, cfg))
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('ABORTED');
    throw new Error('NETWORK: ' + (e.message || e));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(friendlyHttpError(res.status, text));
  }
  const json = await res.json().catch(() => null);
  return json?.choices?.[0]?.message?.content ?? '';
}

export function buildTranslateMessages(text, settings, { source = '英文', target } = {}) {
  const cfg = settings.llm || {};
  const user = renderTemplate(cfg.userTemplate || '{{text}}', {
    text,
    target: target || settings.targetLang || '简体中文',
    source
  });
  return [
    { role: 'system', content: cfg.systemPrompt || '你是一位专业译者。' },
    { role: 'user', content: user }
  ];
}

/** 单词模式下“让 AI 解释这个词”的提示词 */
export function buildExplainMessages(word, settings) {
  const target = settings.targetLang || '简体中文';
  return [
    { role: 'system', content: '你是一本英汉词典。回答必须紧凑，直接给内容，不要客套话。' },
    {
      role: 'user',
      content: [
        `请给出英文单词/短语「${word}」的以下内容：`,
        `1. ${target}释义（一词多义时按 1) 2) 3) 列出，注明词性）`,
        '2. 最常搭配的 1-2 个短语及各一句简短例句（附中文）',
        '3. 常见词形变化（如有）',
        '',
        `输出限定 8 行以内，使用 ${target}。`
      ].join('\n')
    }
  ];
}

/** 设置页“测试连接” */
export async function testConnection(settings) {
  const cfg = settings.llm || {};
  const started = Date.now();
  const text = await chatOnce({
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    cfg: { ...cfg, maxTokens: 16, temperature: 0 },
    timeoutMs: 30000
  });
  return { ok: true, reply: String(text).trim().slice(0, 40), latencyMs: Date.now() - started };
}
