// === Agent Chat Room API ===
// 功能：实现 Agent 之间、Agent 与人类之间的即时通讯
// 支持：@提及检测、命令解析、自动响应、LLM 智能回复
// 存储：SQLite (chat_messages, agent_communications)

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getChatMessageStore } = require('../services/chat-message-store');

// LLM 服务
let llmService = null;
try {
  llmService = require('../services/llm-service');
  console.log('[CHAT] LLM 服务已加载');
} catch (e) {
  console.warn('[CHAT] LLM 服务未找到，将使用硬编码回复');
}

const MAX_MESSAGES = 1000;

// 获取在线 Agent 列表
function getOnlineAgents() {
  try {
    const DATA_DIR = path.join(__dirname, '..', 'data');
    const agentsFile = path.join(DATA_DIR, 'agents-status.json');
    
    if (fs.existsSync(agentsFile)) {
      const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
      return agents.filter(a => a.status !== 'offline').map(a => a.id);
    }
  } catch {
    // error handling
  }
  return ['main', 'coder', 'chat', 'deep', 'fast'];
}

// 检测 @提及
function detectMentions(text) {
  const mentions = [];
  // 支持 @all、@全员、@agent名
  const mentionRegex = /@(全员|all|[\w]+(-[\w]+)?)/gi;
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const mentioned = match[1].toLowerCase();
    // 完整的 Agent 映射
    const agentMap = {
      'main': 'main',
      'chat': 'chat',
      'deep': 'deep',
      'fast': 'fast',
      'coder': 'coder',
      'coder-1': 'coder-1',
      'coder-2': 'coder-2',
      'test': 'test',
      'office': 'office',
      'office-1': 'office-1',
      // 别名
      'm': 'main',
      'c': 'coder',
      'd': 'deep',
      'f': 'fast',
      // 全员（支持中英文）
      'all': 'all',
      '全员': 'all'
    };
    if (agentMap[mentioned]) {
      mentions.push(agentMap[mentioned]);
    }
  }
  return [...new Set(mentions)];
}

// 检测命令
function detectCommand(text) {
  const cmdMatch = text.match(/^\/(\w+)/i);
  return cmdMatch ? cmdMatch[1].toLowerCase() : null;
}

/**
 * 生成智能回复（支持 LLM）- 修复版
 * - 检测 @提及 后调用 LLM API
 * - 传递上下文：发送者、消息内容、Agent 角色设定
 * - LLM 生成智能回复，保持 Agent 个性
 * - 支持多轮对话上下文
 * - LLM 返回 null 时使用降级回复
 */
async function generateResponse(sender, text, targetAgent, context = []) {
  const command = detectCommand(text);
  const mentions = detectMentions(text);
  
  // 处理命令
  if (command) {
    switch(command) {
      case 'help':
        return {
          sender: 'system',
          senderType: 'agent',
          text: `📚 **帮助**
可用命令：
/help - 显示帮助
/status - 查看任务状态
/agents - 查看在线 Agent

提及格式：
🎯 核心：@Main @Chat @Deep @Fast @Coder
🔧 专业：@Coder-1 @Coder-2 @Test @Office @Office-1
📢 全员：@all 或 @全员`
        };
      case 'status':
        return {
          sender: 'system',
          senderType: 'agent',
          text: `📊 **当前状态**\n在线 Agent: ${getOnlineAgents().join(', ')}\n消息系统：运行中`
        };
      case 'agents':
        return {
          sender: 'system',
          senderType: 'agent',
          text: `🤖 **在线 Agent**\n${getOnlineAgents().map(id => `- ${id}`).join('\n')}`
        };
      default:
        return {
          sender: 'system',
          senderType: 'agent',
          text: `❓ 未知命令：/${command}。输入 /help 查看帮助`
        };
    }
  }
  
  // 处理 @全员 - 返回多个回复
  if (mentions.includes('all')) {
    const onlineAgents = getOnlineAgents();
    const responses = onlineAgents.slice(0, 3).map(agentId => ({
      sender: agentId,
      senderType: 'agent',
      text: `🤖 @${sender} 收到！`
    }));
    responses.unshift({
      sender: 'system',
      senderType: 'agent',
      text: `📢 @${sender} 已通知所有在线 Agent（${onlineAgents.length}人）`
    });
    return responses;
  }
  
  // 处理单个 @提及 - 使用 LLM 生成智能回复
  if (mentions.length > 0) {
    const target = mentions[0].toLowerCase();
    
    // 使用 LLM 服务生成回复
    if (llmService) {
      try {
        console.log(`[CHAT] 调用 LLM 生成回复: ${target}`);
        const reply = await llmService.generateAgentReply(target, sender, text, context);
        
        // 降级处理：如果 LLM 返回 null 或空字符串，使用固定回复
        if (!reply || reply.trim() === '') {
          const soul = llmService.getAgentSoul(target);
          const fallback = llmService.generateFallbackReply(target, sender, soul);
          console.log(`[CHAT] LLM 返回空，使用降级回复: ${target}`);
          return {
            sender: target,
            senderType: 'agent',
            text: fallback
          };
        }
        
        return {
          sender: target,
          senderType: 'agent',
          text: reply
        };
      } catch (error) {
        console.error('[CHAT] LLM 调用失败:', error.message);
        // LLM 调用异常，使用 fallback
        const soul = llmService.getAgentSoul(target);
        const fallback = llmService.generateFallbackReply(target, sender, soul);
        return {
          sender: target,
          senderType: 'agent',
          text: fallback
        };
      }
    }
  }
  
  return null;
}

// GET /api/chat/messages - 获取消息列表（SQLite）
router.get('/messages', (req, res) => {
  const { since, limit = 50, agent } = req.query;
  
  const chatStore = getChatMessageStore();
  
  let options = {
    limit: parseInt(limit),
    offset: 0
  };
  
  // 按 Agent 过滤
  if (agent && agent !== 'all') {
    options.sender = agent;
  }
  
  let messages = chatStore.getMessages(options);
  
  // 增量拉取
  if (since) {
    const sinceId = parseInt(since);
    messages = messages.filter(m => m.id > sinceId);
  }
  
  res.json({ success: true, messages });
});

// POST /api/chat/send - 发送消息（SQLite）
router.post('/send', async (req, res) => {
  try {
    const { sender, senderType, text, content, targetAgent } = req.body || {};
    const messageText = text || content;
    
    if (!sender || !messageText) {
      return res.status(400).json({ 
        success: false, 
        error: '发送者和内容不能为空' 
      });
    }
    
    // 创建消息对象
    const newMessage = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sender: sender,
      senderType: senderType || 'human',
      content: messageText,
      targetAgent: targetAgent || null,
      read: false
    };
    
    // 保存到 SQLite
    const chatStore = getChatMessageStore();
    chatStore.saveMessage({
      id: newMessage.id,
      timestamp: newMessage.timestamp,
      sender: sender,
      senderType: senderType || 'human',
      content: messageText,
      targetAgent: targetAgent,
      read: false
    });
    
    // 保存 Agent 通信记录（如果 targetAgent 存在）
    if (targetAgent) {
      chatStore.saveAgentCommunication(sender, targetAgent, messageText, {
        roomId: null,
        messageType: 'text'
      });
    }
    
    // 检测是否需要智能回复（异步）
    const response = await generateResponse(sender, messageText, targetAgent);
    if (response) {
      // 支持单个回复或多个回复（@全员）
      if (Array.isArray(response)) {
        response.forEach((r, i) => {
          const agentMsg = {
            id: Date.now() + i + 1,
            timestamp: new Date().toISOString(),
            sender: r.sender,
            senderType: r.senderType,
            content: r.text,
            targetAgent: sender,
            read: false
          };
          chatStore.saveMessage(agentMsg);
          // 保存 Agent 通信记录
          chatStore.saveAgentCommunication(r.sender, sender, r.text, {
            roomId: null,
            messageType: 'text'
          });
        });
        console.log(`[CHAT] @全员 自动回复：${response.length} 条`);
      } else {
        const agentMsg = {
          id: Date.now() + 1,
          timestamp: new Date().toISOString(),
          sender: response.sender,
          senderType: response.senderType,
          content: response.text,
          targetAgent: sender,
          read: false
        };
        chatStore.saveMessage(agentMsg);
        // 保存 Agent 通信记录
        chatStore.saveAgentCommunication(response.sender, sender, response.text, {
          roomId: null,
          messageType: 'text'
        });
        console.log(`[CHAT] 自动回复：${response.sender}: ${response.text}`);
      }
    }
    
    console.log(`[CHAT] ${sender}: ${text}`);
    
    // 返回用户消息和 Agent 回复
    res.json({ 
      success: true, 
      message: newMessage,
      reply: response || null
    });
  } catch (err) {
    console.error('[CHAT ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/mark-read - 标记已读（SQLite）
router.post('/mark-read', (req, res) => {
  const { messageId } = req.body;
  const chatStore = getChatMessageStore();
  
  // Update read status in SQLite
  chatStore.db.run(`
    UPDATE chat_messages SET read = 1 WHERE id = ?
  `, [messageId]);
  
  res.json({ success: true });
});

// GET /api/chat/agent-communications - 获取 Agent 通信记录
router.get('/agent-communications', (req, res) => {
  const { from, to, limit = 50, offset = 0 } = req.query;
  
  const chatStore = getChatMessageStore();
  const communications = chatStore.getAgentCommunications({
    fromAgent: from || undefined,
    toAgent: to || undefined,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
  
  res.json({ 
    success: true, 
    communications,
    total: communications.length
  });
});

// GET /api/chat/stats - 获取聊天统计
router.get('/stats', (req, res) => {
  const chatStore = getChatMessageStore();
  const stats = chatStore.getStats();
  const agentStats = chatStore.getAgentCommunicationStats();
  
  res.json({ 
    success: true, 
    chatStats: stats,
    agentStats: agentStats
  });
});

// GET /api/chat/agents - 获取在线 Agent
router.get('/agents', (req, res) => {
  res.json({ success: true, agents: getOnlineAgents() });
});

console.log('✅ Agent Chat API 已加载');

module.exports = router;

// ========================================
// LLM 配置 API
// ========================================

// GET /api/chat/llm-config - 获取当前 LLM 配置
router.get('/llm-config', (req, res) => {
  const llm = require('../services/llm-service');
  res.json({
    success: true,
    config: llm.getCurrentConfig()
  });
});

// POST /api/chat/llm-config/reload - 重新加载配置
router.post('/llm-config/reload', (req, res) => {
  const llm = require('../services/llm-service');
  llm.clearSoulCache();
  res.json({
    success: true,
    message: '配置已重新加载',
    config: llm.getCurrentConfig()
  });
});
