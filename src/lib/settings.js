/**
 * 全局设置：读取 / 保存 / 变更订阅
 * 所有配置存放在 chrome.storage.local（含 API Key，不做跨设备同步）。
 */

export const STORAGE_KEY = 'lingualens.settings.v1';

export const LLM_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    hint: '默认走 gpt-4o-mini，便宜且够快'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '国内直连，翻译质量好，价格低'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    hint: '有免费额度模型可选（需先在官网确认模型名）'
  },
  {
    id: 'moonshot',
    name: 'Moonshot 月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    hint: 'Kimii 同款，中文表达自然'
  },
  {
    id: 'dashscope',
    name: '阿里通义千问（兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    hint: '阿里云百炼，兼容 OpenAI 接口'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    hint: 'glm-4-flash 有免费额度'
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    hint: '需在 Chrome 的 chrome://extensions 无头可选权限中放行 localhost'
  },
  {
    id: 'custom',
    name: '自定义（任何 OpenAI 兼容接口）',
    baseUrl: '',
    model: '',
    hint: '填入任意兼容 /chat/completions 的网关地址'
  }
];

const DEFAULT_SYSTEM_PROMPT = [
  '你是一位精通中英互译的资深译者。',
  '要求：译文忠实于原文含义，中文表达自然流畅，符合目标语言的阅读习惯；',
  '保留原文的换行、列表、代码块与技术术语原文（如 API、Pod、etcd 等专业词不强行翻译）；',
  '只输出译文本身，不要输出解释、不要加引号、不要加前缀。'
].join('\n');

const DEFAULT_USER_TEMPLATE = '请将下面的{{source}}文本翻译成{{target}}：\n\n{{text}}';

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoShow: true,          // 选中后自动弹窗
  autoShowDelayMs: 180,    // 自动弹窗延迟
  sentenceMaxChars: 600,   // 超过这个长度不再自动翻译，需手动确认
  detectCNinWordMode: true,
  showPhonetic: true,
  showChineseDict: true,
  showEnglishDef: true,
  showExample: false,
  targetLang: '简体中文',
  theme: 'auto',           // auto | light | dark
  llm: {
    presetId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 1024,
    stream: true,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userTemplate: DEFAULT_USER_TEMPLATE
  }
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!patch || typeof patch !== 'object') return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export async function getSettings() {
  const store = await chrome.storage.local.get(STORAGE_KEY);
  return deepMerge(DEFAULT_SETTINGS, store[STORAGE_KEY] || {});
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = deepMerge(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function resetSettings() {
  await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

export function onSettingsChanged(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      cb(changes[STORAGE_KEY].newValue);
    }
  });
}
