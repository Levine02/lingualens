/**
 * 词典数据源（多源聚合）
 *
 * 主源：dict.youdao.com/jsonapi —— 中文释义、音标、发音、词形变化，覆盖率高（支持短语与专有名词）
 * 辅源：api.dictionaryapi.dev —— 英文释义、IPA 音标、真人发音 mp3（英文释义质量更好）
 * 兜底：dict.youdao.com/suggest —— 主源异常时的中文释义备用
 *
 * 三个源都免费、无需 API Key。任一来源失败不影响其它来源。
 */

const ENTRY_CACHE = new Map();
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 300;
const NET_TIMEOUT_MS = 12000;

function cacheGet(key) {
  const hit = ENTRY_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL) {
    ENTRY_CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  if (ENTRY_CACHE.size >= CACHE_MAX) {
    const oldest = ENTRY_CACHE.keys().next().value;
    ENTRY_CACHE.delete(oldest);
  }
  ENTRY_CACHE.set(key, { ts: Date.now(), data });
}

async function getJSON(url, { timeout = NET_TIMEOUT_MS, retries = 1 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
        credentials: 'omit'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('request failed');
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');

/**
 * 把有道的一条释义拆成 {pos, senses}
 * "v. 跑，奔跑；跑垒" -> {pos:'v.', senses:['跑，奔跑','跑垒']}
 */
export function splitSense(raw) {
  const text = stripTags(raw).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const m = text.match(/^([a-zA-Z]{1,6}\.)\s*(.*)$/);
  if (!m) {
    const senses = text.split(/[；;]/).map((s) => s.trim()).filter(Boolean);
    return senses.length ? { pos: '', senses: senses.slice(0, 4) } : null;
  }
  const senses = m[2].split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  return senses.length ? { pos: m[1], senses: senses.slice(0, 4) } : null;
}

/** 统一按「词性前缀 + 中文分号」切分整段释义 */
export function parseExplain(raw) {
  return String(raw || '')
    .split(/[；;](?=\s*[a-zA-Z]{1,6}\.\s)/)
    .map(splitSense)
    .filter(Boolean);
}

/* ----------------------------- 主源：有道 jsonapi ----------------------------- */

/** @param {string} rawWord */
export async function lookupYoudao(rawWord) {
  const word = String(rawWord || '').trim().toLowerCase();
  if (!word) throw new Error('EMPTY_WORD');
  const cacheKey = 'yd:' + word;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const json = await getJSON(
    `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`,
    { retries: 1 }
  );

  const w = json?.ec?.word?.[0] || json?.simple?.word?.[0] || null;
  const trs = w?.trs || [];
  const chinese = [];
  for (const group of trs) {
    for (const tr of group?.tr || []) {
      for (const line of tr?.l?.i || []) {
        const parsed = splitSense(line);
        if (parsed) chinese.push(parsed);
      }
    }
    if (chinese.length >= 8) break;
  }

  const forms = (w?.wfs || []).slice(0, 6).map((x) => ({
    name: stripTags(x?.wf?.name || ''),
    value: stripTags(x?.wf?.value || '')
  })).filter((f) => f.name && f.value);

  const uk = w?.ukphone ? stripTags(w.ukphone).trim() : '';
  const us = w?.usphone ? stripTags(w.usphone).trim() : '';
  const voiceParam = w?.ukspeech || w?.usspeech || encodeURIComponent(word);

  const result = {
    chinese: chinese.slice(0, 8),
    forms,
    phonetic: { uk, us },
    voices: {
      uk: uk || us ? `https://dict.youdao.com/dictvoice?audio=${voiceParam}&type=1` : '',
      us: uk || us ? `https://dict.youdao.com/dictvoice?audio=${voiceParam}&type=2` : ''
    },
    entry: stripTags(w?.['return-phrase']?.l?.i || '') || word
  };
  if (!result.chinese.length && !uk && !us) throw new Error('NO_RESULT');
  cacheSet(cacheKey, result);
  return result;
}

/* ----------------------------- 兜底：有道 suggest ----------------------------- */

export async function lookupChineseFallback(rawWord) {
  const word = String(rawWord || '').trim().toLowerCase();
  const cacheKey = 'ydsg:' + word;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const json = await getJSON(
    `https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&le=eng&num=3&doctype=json`
  );
  const entries = json?.data?.entries || [];
  const hit = entries.find((e) => String(e.entry || '').toLowerCase() === word) || entries[0];
  const chinese = hit?.explain ? parseExplain(hit.explain) : [];
  if (chinese.length) cacheSet(cacheKey, chinese);
  return chinese;
}

/* ----------------------------- 辅源：dictionaryapi.dev ----------------------------- */

function guessAccent(audioUrl, text) {
  const name = String(audioUrl || '').toLowerCase();
  if (/[-_]us\.mp3$/.test(name) || name.includes('-us') || name.includes('_us')) return 'us';
  if (name.includes('-au') || name.includes('-uk') || name.includes('-gb') || name.includes('_gb')) return 'uk';
  if (/[ɚɝ]/.test(String(text || ''))) return 'us';
  return 'unknown';
}

/** 英文词条：英文释义 + IPA 音标 + 真人发音 mp3 */
export async function lookupEnglish(rawWord) {
  const word = String(rawWord || '').trim().toLowerCase();
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’\s-]{0,44}$/u.test(word)) throw new Error('NOT_A_WORD');
  const cacheKey = 'en:' + word;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const data = await getJSON(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { retries: 1 }
  );
  if (!Array.isArray(data) || !data.length) throw new Error('NO_RESULT');
  if (data[0]?.title && data[0]?.message) throw new Error('NO_RESULT');

  const entry = data[0];
  const audios = {};
  for (const p of entry.phonetics || []) {
    if (!p.audio) continue;
    const accent = guessAccent(p.audio, p.text);
    if (accent === 'us' && !audios.us) audios.us = p.audio;
    else if (accent === 'uk' && !audios.uk) audios.uk = p.audio;
    else if (!audios.any) audios.any = p.audio;
  }

  const meanings = (entry.meanings || []).slice(0, 5).map((m) => ({
    partOfSpeech: m.partOfSpeech || '',
    items: (m.definitions || []).slice(0, 3).map((d) => ({
      definition: stripTags(d.definition || ''),
      example: stripTags(d.example || '')
    })).filter((d) => d.definition)
  })).filter((m) => m.items.length);

  if (!meanings.length && !entry.phonetic) throw new Error('NO_RESULT');

  const result = {
    word: entry.word || word,
    phonetic: entry.phonetic || (entry.phonetics || []).find((p) => p.text)?.text || '',
    audios,
    meanings,
    sourceUrl: entry.sourceUrls?.[0] || ''
  };
  cacheSet(cacheKey, result);
  return result;
}

/* ----------------------------- 聚合入口 ----------------------------- */

const withSlash = (p) => {
  const t = String(p || '').trim();
  if (!t) return '';
  return t.startsWith('/') ? t : `/${t}/`;
};

/**
 * 单词模式一次性查询
 * @returns {Promise<{word:string, phonetic:string, audios:{uk?:string,us?:string,any?:string},
 *                    chinese:Array<{pos:string,senses:string[]}>, forms:Array<{name,value}>,
 *                    meanings:Array<{partOfSpeech:string,items:Array<{definition,example}>}>,
 *                    errors:Object, sources:string[]}>}
 */
export async function lookupWord(rawWord) {
  const word = String(rawWord || '').trim();
  const tasks = [
    lookupYoudao(word).catch((e) => ({ __err: String(e?.message || e) })),
    lookupEnglish(word).catch((e) => ({ __err: String(e?.message || e) }))
  ];
  let [yd, en] = await Promise.all(tasks);

  // 主源异常时启用 suggest 兜底
  if (yd.__err) {
    try {
      const fallbackGroups = await lookupChineseFallback(word);
      if (fallbackGroups.length) yd = { chinese: fallbackGroups, forms: [], phonetic: { uk: '', us: '' }, voices: { uk: '', us: '' } };
    } catch { /* ignore */ }
  }
  if (en.__err) en = null;
  const ydOk = yd && !yd.__err;
  const enOk = en && !en.__err;

  const sources = [];
  if (ydOk) sources.push('有道');
  if (enOk) sources.push('dictionaryapi.dev');

  const uk = ydOk ? (yd.phonetic?.uk || '') : '';
  const us = ydOk ? (yd.phonetic?.us || '') : '';

  let phonetic = enOk && en.phonetic ? withSlash(en.phonetic) : '';
  if (!phonetic) {
    if (uk && us && uk !== us) phonetic = `英 ${withSlash(uk)} · 美 ${withSlash(us)}`;
    else phonetic = withSlash(uk || us);
  }

  const audios = {
    uk: (enOk && en.audios?.uk) || (ydOk && yd.voices?.uk) || (enOk && en.audios?.any) || '',
    us: (enOk && en.audios?.us) || (ydOk && yd.voices?.us) || (enOk && en.audios?.any) || ''
  };

  const payload = {
    word,
    phonetic,
    audios,
    chinese: (ydOk ? yd.chinese : []) || [],
    forms: (ydOk ? yd.forms : []) || [],
    meanings: (enOk ? en.meanings : []) || [],
    englishWord: enOk ? en.word : '',
    sources,
    errors: {
      youdao: ydOk ? null : String(yd?.__err || ''),
      english: enOk ? null : String(en?.__err || '')
    }
  };

  if (!payload.chinese.length && !payload.meanings.length && !payload.phonetic) {
    const err = new Error('NO_RESULT');
    err.payload = payload;
    throw err;
  }
  return payload;
}
