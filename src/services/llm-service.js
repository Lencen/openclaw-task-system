/**
 * LLM Service - 调用 LLM 生成智能回复
 * 从 openclaw.json 读取 provider 配置，支持多 provider
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'openclaw.json');
const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
const FEDERATION_FILE = path.join(__dirname, '..', 'data', 'federation-config.json');

// 缓存
const soulCache = {};
let providersCache = null;

/**
 * 从 openclaw.json 读取所有 provider 配置
 */
function loadProviders() {
  if (providersCache) return providersCache;
  
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    providersCache = config.models?.providers || {};
    return providersCache;
  } catch (e) {
    console.error('[LLM] 读取配置失败:', e.message);
    return {};
  }
}

/**
 * 根据模型名称获取 provider 配置
 * 模型格式: {provider}/{model}，如 nvidia-1/qwen/qwen3-coder-480b-a35b-instruct
 */
function getProviderForModel(modelName) {
  if (!modelName || modelName === 'default') {
    return null;
  }
  
  const providers = loadProviders();
  
  // 解析模型名称：只分割第一个 /
  const slashIndex = modelName.indexOf('/');
  if (slashIndex > 0) {
    const providerId = modelName.substring(0, slashIndex);
    const modelId = modelName.substring(slashIndex + 1);  // 保留后面的所有部分
    const provider = providers[providerId];
    if (provider) {
      return {
        providerId,
        baseUrl: provider.baseUrl, // 保留原始 baseUrl，路径拼接在 callLLM 中处理
        apiKey: provider.apiKey,
        model: modelId,
        auth: provider.auth || 'bearer'  // 默认使用 Bearer 认证
      };
    }
  }
  
  // 兼容旧格式（无 provider 前缀）
  return null;
}

/**
 * 获取默认 provider（第一个可用的）
 */
function getDefaultProvider() {
  const providers = loadProviders();
  
  // 优先使用 nvidia-2（通用模型）
  if (providers['nvidia-2']) {
    const p = providers['nvidia-2'];
    const firstModel = p.models?.[0]?.id || 'meta/llama3.1-70b-instruct';
    return {
      providerId: 'nvidia-2',
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      model: firstModel,
      auth: p.auth || 'bearer'
    };
  }
  
  // 其次使用 nvidia-1
  if (providers['nvidia-1']) {
    const p = providers['nvidia-1'];
    return {
      providerId: 'nvidia-1',
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      model: 'qwen/qwen3-coder-480b-a35b-instruct',
      auth: p.auth || 'bearer'
    };
  }
  
  // 优先使用 qwencoding（阿里云）
  if (providers['qwencoding']) {
    const p = providers['qwencoding'];
    return {
      providerId: 'qwencoding',
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      model: 'glm-5',
      auth: p.auth || 'bearer'
    };
  }
  
  // 返回第一个可用的
  for (const [id, p] of Object.entries(providers)) {
    if (p.apiKey && p.baseUrl) {
      return {
        providerId: id,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        model: p.models?.[0]?.id || 'default',
        auth: p.auth || 'bearer'
      };
    }
  }
  
  return null;
}

/**
 * 从 SOUL.md 读取 Agent 角色设定
 */
function getAgentSoul(agentId) {
  if (soulCache[agentId]) {
    return soulCache[agentId];
  }
  
  const soulPath = path.join(AGENTS_DIR, agentId, 'SOUL.md');
  
  if (!fs.existsSync(soulPath)) {
    return getDefaultSoul(agentId);
  }
  
  try {
    const content = fs.readFileSync(soulPath, 'utf-8');
    
    // 读取整块内容，然后解析字段
    const soul = {
      name: extractField(content, '名称') || agentId,
      icon: extractIconFromContent(content) || '🤖',
      role: extractContentBlock(content, '角色定义'),
      traits: extractContentBlock(content, '核心特质'),
      duties: extractContentBlock(content, '工作职责'),
      style: extractContentBlock(content, '工作风格') || ''
    };
    soulCache[agentId] = soul;
    return soul;
  } catch (e) {
    console.warn('[LLM] 读取 SOUL.md 失败:', e.message);
    return getDefaultSoul(agentId);
  }
}

/**
 * 从 SOUL.md 内容提取图标
 */
function extractIconFromContent(content) {
  // 尝试从列表格式提取图标：- **图标**：🤖
  const listRegex = /-\s*\*\*图标\*\*[：:]?\s*([^\n]+)/i;
  const listMatch = content.match(listRegex);
  if (listMatch) {
    return listMatch[1].trim();
  }
  return null;
}

/**
 * 提取字段值（从列表格式中提取：- **字段名**：值）
 */
function extractField(content, fieldName) {
  const regex = new RegExp(`-\\s*\\*\\*${fieldName}\\*\\*[：:]?\\s*(.+)$`, 'mi');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * 提取标题下的所有内容块（从 ## 标题到下一个 ## 之前）
 */
function extractContentBlock(content, sectionName) {
  // 可能的格式：## 标题 或 ### 标题
  const sectionRegex = new RegExp(`#{1,6}\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n#{1,6}\\s|\\z)`, 'i');
  const match = content.match(sectionRegex);
  if (match) {
    // 提取列表内容，去掉序号和列表标记
    let block = match[1].trim();
    // 转换列表项为纯文本：移除列表前缀
    block = block.replace(/^-\\s*/gm, '');
    // 移除粗体标记
    block = block.replace(/\*\*/g, '');
    // 移除行内换行，合并为段落
    block = block.replace(/\n+/g, ' ').trim();
    return block;
  }
  return '';
}

function getDefaultSoul(agentId) {
  const defaults = {
    'main': { name: 'Main Agent', icon: '🎯', role: '总控 Agent', traits: '全局视角', duties: '协调分配', style: '简洁明了' },
    'coder': { name: 'Coder Agent', icon: '💻', role: '编码 Agent', traits: '技术精准', duties: '代码开发', style: '代码优先' },
    'deep': { name: 'Deep Agent', icon: '🧠', role: '深度分析 Agent', traits: '逻辑严密', duties: '复杂分析', style: '深入分析' },
    'fast': { name: 'Fast Agent', icon: '⚡', role: '快速响应 Agent', traits: '高效执行', duties: '快速响应', style: '快速直接' },
    'chat': { name: 'Chat Agent', icon: '💬', role: '对话 Agent', traits: '友好亲切', duties: '日常对话', style: '耐心解答' },
    'test': { name: 'Test Agent', icon: '🔍', role: '测试 Agent', traits: '关注细节', duties: '测试验证', style: '覆盖全面' },
    'office': { name: 'Office Agent', icon: '📊', role: '办公 Agent', traits: '格式规范', duties: '文档处理', style: '结构清晰' }
  };
  return defaults[agentId] || { name: agentId, icon: '🤖', role: '智能助手', traits: '乐于助人', duties: '协助用户', style: '友好专业' };
}

/**
 * 获取 Agent 专属模型配置
 */
function getAgentModel(agentId) {
  try {
    if (fs.existsSync(FEDERATION_FILE)) {
      const config = JSON.parse(fs.readFileSync(FEDERATION_FILE, 'utf8'));
      const agent = config.localAgents?.find(a => a.id === agentId);
      if (agent?.model && agent.model !== 'default') {
        // 如果是 uos 模型，改用默认模型（因为 API Key 无效）
        if (agent.model.startsWith('uos/')) {
          return null; // 使用默认 provider
        }
        return agent.model;
      }
    }
  } catch (e) {
    console.warn('[LLM] 读取 Agent 模型配置失败:', e.message);
  }
  return null;
}

function buildAgentPrompt(soul) {
  let prompt = `你是 ${soul.name}，${soul.role}。\n\n`;
  if (soul.traits) prompt += `核心特质：${soul.traits}\n\n`;
  if (soul.duties) prompt += `工作职责：${soul.duties}\n\n`;
  if (soul.style) prompt += `回复风格：${soul.style}\n\n`;
  prompt += `请用中文简洁回复，不超过 200 字。`;
  return prompt;
}

/**
 * 调用 LLM API
 */
async function callLLM(messages, options = {}) {
  const { temperature = 0.7, maxTokens = 500, model = null } = options;
  
  // 确定使用的 provider
  let provider;
  let useModel;
  
  if (model) {
    // 指定了模型，解析 provider
    provider = getProviderForModel(model);
    if (provider) {
      useModel = provider.model;
    } else {
      // 无法解析，使用默认 provider 但尝试使用指定模型
      provider = getDefaultProvider();
      useModel = model.includes('/') ? model.split('/')[1] : model;
    }
  } else {
    // 未指定模型，使用默认
    provider = getDefaultProvider();
    useModel = provider.model;
  }
  
  if (!provider) {
    throw new Error('没有可用的 LLM provider');
  }
  
  console.log(`[LLM] 使用 provider: ${provider.providerId}, 模型: ${useModel}`);
  
  const body = JSON.stringify({
    model: useModel,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens,
    stream: false
  });
  
  console.log('[LLM] 请求体:', body.substring(0, 200) + '...');
  console.log('[LLM] URL:', provider.baseUrl + '/chat/completions');
  console.log('[LLM] 认证方式:', provider.auth || 'bearer');
  
  return new Promise((resolve, reject) => {
    const url = new URL(provider.baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    
    // 正确拼接路径：如果 baseUrl 包含 pathname，直接追加 chat/completions
    // 否则追加 /v1/chat/completions
    const basePath = url.pathname !== '/' ? url.pathname : '';
    const path = basePath ? `${basePath}/chat/completions` : '/chat/completions';
    
    // 根据 auth 类型选择认证方式
    const authType = provider.auth || 'bearer';
    const authHeader = authType === 'api-key' 
      ? `api-key ${provider.apiKey}`
      : `Bearer ${provider.apiKey}`;
    
    console.log('[LLM] 请求路径:', path);
    console.log('[LLM] 请求头 Authorization:', authHeader.substring(0, 20) + '...');
    
    const req = protocol.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[LLM] 响应状态:', res.statusCode);
        console.log('[LLM] 响应内容:', data.substring(0, 300));
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || 'LLM API error'));
          } else {
            resolve(json.choices[0].message.content);
          }
        } catch (e) {
          console.error('[LLM] JSON 解析失败:', e.message, '响应:', data.substring(0, 100));
          reject(e);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('[LLM] 请求失败:', e.message);
      reject(e);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('LLM API timeout'));
    });
    
    req.write(body);
    req.end();
  });
}

/**
 * 生成 Agent 智能回复
 */
async function generateAgentReply(agentId, senderName, userMessage, context = []) {
  const soul = getAgentSoul(agentId);
  const systemPrompt = buildAgentPrompt(soul);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `用户 ${senderName} 向你发送了消息。` }
  ];
  
  if (context && context.length > 0) {
    messages.push({ role: 'system', content: `最近的对话：\n${context.slice(-3).join('\n')}` });
  }
  
  messages.push({ role: 'user', content: userMessage });
  
  const agentModel = getAgentModel(agentId);
  
  try {
    const reply = await callLLM(messages, { 
      temperature: 0.8, 
      maxTokens: 300,
      model: agentModel
    });
    return reply;
  } catch (error) {
    console.error('[LLM] 调用失败:', error.message);
    return null;
  }
}

function generateFallbackReply(agentId, senderName, soul) {
  const icon = soul?.icon || '🤖';
  const name = soul?.name || agentId;
  return `${icon} @${senderName} ${name} 收到！有什么可以帮你的？`;
}

function getCurrentConfig() {
  const provider = getDefaultProvider();
  return provider;
}

function clearCache() {
  Object.keys(soulCache).forEach(key => delete soulCache[key]);
  providersCache = null;
}

function clearSoulCache() {
  Object.keys(soulCache).forEach(key => delete soulCache[key]);
}

module.exports = {
  callLLM,
  generateAgentReply,
  getAgentSoul,
  getAgentModel,
  generateFallbackReply,
  loadProviders,
  getDefaultProvider,
  getCurrentConfig,
  clearCache,
  clearSoulCache
};
// v1.1: 修复 Path 处理，支持 openai 兼容 API 格式
// v1.2: 增加 clearSoulCache 方法
