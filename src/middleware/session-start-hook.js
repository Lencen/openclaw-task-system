/**
 * 会话开始钩子
 * 在Gateway会话开始时自动检查通知并注入提醒
 * 
 * 功能：
 * 1. 会话开始时检查未读通知
 * 2. 自动注入提醒到会话上下文
 * 3. 支持多种通知类型
 */

const fs = require('fs');
const path = require('path');

const NOTIFICATIONS_FILE = path.join(__dirname, '../data/notifications.json');
const SESSION_HOOKS_CONFIG = path.join(__dirname, '../data/session-hooks.json');

// 通知类型配置
const NOTIFICATION_TYPES = {
  system: {
    emoji: '⚙️',
    color: '#3b82f6',
    priority: 'normal'
  },
  task: {
    emoji: '📋',
    color: '#10b981',
    priority: 'high'
  },
  alert: {
    emoji: '🚨',
    color: '#ef4444',
    priority: 'critical'
  },
  reminder: {
    emoji: '⏰',
    color: '#f59e0b',
    priority: 'normal'
  },
  warning: {
    emoji: '⚠️',
    color: '#f59e0b',
    priority: 'high'
  },
  info: {
    emoji: 'ℹ️',
    color: '#64748b',
    priority: 'low'
  }
};

/**
 * 读取通知数据
 */
function readNotifications() {
  try {
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.notifications || [];
  } catch (error) {
    console.error('[SessionHook] Error reading notifications:', error);
    return [];
  }
}

/**
 * 获取未读通知
 * @param {string} agentId - Agent ID
 * @returns {Array} 未读通知列表
 */
function getUnreadNotifications(agentId = null) {
  const notifications = readNotifications();
  const now = Date.now();
  
  return notifications.filter(n => {
    // 检查是否已读
    if (n.read) return false;
    
    // 检查过期
    if (n.expires_at && new Date(n.expires_at).getTime() < now) {
      return false;
    }
    
    // 检查接收者
    if (agentId) {
      return n.to === 'all' || n.to === agentId || n.to === 'main';
    }
    
    return n.to === 'all' || !n.to;
  });
}

/**
 * 获取通知数量
 * @param {string} agentId - Agent ID
 * @returns {object} 通知统计
 */
function getNotificationStats(agentId = null) {
  const notifications = readNotifications();
  const now = Date.now();
  const unread = notifications.filter(n => {
    if (n.read) return false;
    if (n.expires_at && new Date(n.expires_at).getTime() < now) return false;
    if (agentId) {
      return n.to === 'all' || n.to === agentId || n.to === 'main';
    }
    return n.to === 'all' || !n.to;
  });
  
  // 按类型统计
  const byType = {};
  unread.forEach(n => {
    byType[n.type] = (byType[n.type] || 0) + 1;
  });
  
  return {
    total: unread.length,
    byType,
    hasUrgent: unread.some(n => n.priority === 'critical' || n.type === 'alert')
  };
}

/**
 * 生成会话开始提醒消息
 * @param {object} stats - 通知统计
 * @returns {string|null} 提醒消息，如果没有则返回null
 */
function generateSessionStartMessage(stats) {
  if (stats.total === 0) {
    return null;
  }
  
  let message = `\n${'─'.repeat(30)}\n`;
  message += `📬 **您有 ${stats.total} 条未读通知**\n`;
  
  // 分类列出
  const typeNames = {
    task: '任务',
    alert: '告警',
    reminder: '提醒',
    warning: '警告',
    system: '系统',
    info: '信息'
  };
  
  for (const [type, count] of Object.entries(stats.byType)) {
    const typeInfo = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;
    message += `${typeInfo.emoji} ${typeNames[type] || type}: ${count}条\n`;
  }
  
  // 紧急通知
  if (stats.hasUrgent) {
    message += `\n🚨 **有紧急通知需要处理！**\n`;
  }
  
  message += `${'─'.repeat(30)}\n`;
  
  return message;
}

/**
 * 标记通知为已读
 * @param {string} notificationId - 通知ID
 * @returns {boolean} 是否成功
 */
function markAsRead(notificationId) {
  try {
    const notifications = readNotifications();
    const index = notifications.findIndex(n => n.id === notificationId);
    
    if (index !== -1) {
      notifications[index].read = true;
      notifications[index].read_at = new Date().toISOString();
      fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify({ notifications }, null, 2));
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SessionHook] Error marking notification as read:', error);
    return false;
  }
}

/**
 * 标记所有通知为已读
 * @param {string} agentId - Agent ID
 * @returns {number} 标记数量
 */
function markAllAsRead(agentId = null) {
  try {
    const notifications = readNotifications();
    let count = 0;
    
    const now = new Date().toISOString();
    notifications.forEach(n => {
      if (!n.read) {
        // 检查是否应该标记
        if (!agentId || n.to === 'all' || n.to === agentId || n.to === 'main') {
          n.read = true;
          n.read_at = now;
          count++;
        }
      }
    });
    
    if (count > 0) {
      fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify({ notifications }, null, 2));
    }
    
    return count;
  } catch (error) {
    console.error('[SessionHook] Error marking all as read:', error);
    return 0;
  }
}

/**
 * 会话开始钩子主函数
 * @param {object} session - 会话对象
 * @returns {object} 钩子结果
 */
async function sessionStartHook(session) {
  const agentId = session?.agentId || session?.agent?.id || 'main';
  const stats = getNotificationStats(agentId);
  const message = generateSessionStartMessage(stats);
  
  const result = {
    executed: true,
    timestamp: new Date().toISOString(),
    agentId,
    hasNotifications: stats.total > 0,
    notificationCount: stats.total,
    message: message,
    stats
  };
  
  // 如果有通知，自动标记为已读（可选）
  // 如果需要保留未读，可以注释下面这行
  // markAllAsRead(agentId);
  
  return result;
}

/**
 * 获取会话开始时的上下文数据
 * @param {string} agentId - Agent ID
 * @returns {object} 上下文数据
 */
function getSessionContext(agentId) {
  const stats = getNotificationStats(agentId);
  const unread = getUnreadNotifications(agentId);
  
  return {
    agentId,
    notifications: {
      count: stats.total,
      byType: stats.byType,
      hasUrgent: stats.hasUrgent,
      recent: unread.slice(0, 5).map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message?.substring(0, 100),
        priority: n.priority,
        created_at: n.created_at
      }))
    }
  };
}

/**
 * Express中间件 - 会话开始时自动注入通知
 * 使用方式：app.use(sessionStartMiddleware);
 */
function sessionStartMiddleware(req, res, next) {
  // 跳过非会话请求
  if (!req.session && !req.headers['x-session-id']) {
    return next();
  }
  
  const agentId = req.headers['x-user-id'] || req.headers['x-agent-id'] || 'main';
  
  // 异步检查通知，不阻塞请求
  sessionStartHook({ agentId }).then(result => {
    // 将通知信息添加到请求对象
    req.sessionContext = result;
    
    // 如果有通知，可以在响应头中添加
    if (result.hasNotifications) {
      res.set('X-Notification-Count', result.notificationCount.toString());
      res.set('X-Has-Urgent-Notification', result.stats.hasUrgent ? 'true' : 'false');
    }
    
    next();
  }).catch(err => {
    console.error('[SessionHook] Error in middleware:', err);
    next();
  });
}

/**
 * WebSocket钩子 - 连接开始时检查通知
 * @param {object} ws - WebSocket连接
 * @param {object} data - 连接数据
 */
async function websocketStartHook(ws, data) {
  const agentId = data?.agentId || 'main';
  return sessionStartHook({ agentId });
}

/**
 * 加载会话钩子配置
 */
function loadHookConfig() {
  try {
    if (fs.existsSync(SESSION_HOOKS_CONFIG)) {
      return JSON.parse(fs.readFileSync(SESSION_HOOKS_CONFIG, 'utf8'));
    }
  } catch (error) {
    console.error('[SessionHook] Error loading config:', error);
  }
  
  // 默认配置
  return {
    enabled: true,
    notifyOnStart: true,
    markAsReadOnStart: false,
    maxNotifications: 10
  };
}

/**
 * 保存会话钩子配置
 */
function saveHookConfig(config) {
  try {
    const dataDir = path.dirname(SESSION_HOOKS_CONFIG);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SESSION_HOOKS_CONFIG, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('[SessionHook] Error saving config:', error);
    return false;
  }
}

module.exports = {
  sessionStartHook,
  getSessionContext,
  getUnreadNotifications,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  generateSessionStartMessage,
  sessionStartMiddleware,
  websocketStartHook,
  loadHookConfig,
  saveHookConfig,
  NOTIFICATION_TYPES
};

// 导出默认
module.exports.default = module.exports;