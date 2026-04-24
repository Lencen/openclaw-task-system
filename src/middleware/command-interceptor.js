/**
 * 命令拦截器中间件
 * 在执行危险命令前自动拦截并提示替代方案
 * 
 * 拦截规则：
 * - rm 删除文件
 * - mv 移动/删除文件
 * - npm create vue 创建Vue应用
 * - 直接修改OpenClaw配置
 */

const fs = require('fs');
const path = require('path');

// 危险命令配置
const DANGEROUS_COMMANDS = {
  // 文件删除类
  'rm': {
    severity: 'high',
    reason: '直接删除文件，可能误删重要文件',
    alternatives: [
      'node scripts/safe-delete.js <文件路径>',
      '使用 trash 命令替代 rm'
    ],
    blocked: true
  },
  'rmdir': {
    severity: 'high',
    reason: '删除目录，可能误删重要数据',
    alternatives: [
      'node scripts/safe-delete.js <目录路径>'
    ],
    blocked: true
  },
  // 文件移动类（删除意图）
  'mv': {
    severity: 'high',
    reason: '移动文件可能用于删除',
    alternatives: [
      'node scripts/safe-delete.js <文件路径> --force (强制删除需确认)',
      '使用复制+删除代替移动'
    ],
    blocked: true,
    // 检查移动目标是否是删除意图
    checkArgs: (args) => {
      if (args.length < 2) return false;
      const dest = args[args.length - 1];
      // 允许备份到 tmp（.bak后缀）
      if (dest.startsWith('/tmp/') && dest.endsWith('.bak')) return false;
      // 检查是否是删除意图
      return dest.startsWith('/tmp/') || 
             dest === '/dev/null' ||
             (dest.includes('backup') && dest.includes('delete')) ||
             dest.includes('trash');
    }
  },
  // Vue项目创建
  'npm': {
    severity: 'high',
    reason: '禁止创建Vue应用',
    alternatives: ['使用HTML统一框架开发页面'],
    blocked: true,
    checkArgs: (args) => {
      return args.some(arg => 
        arg.includes('create vue') || 
        arg.includes('create-vue') ||
        arg.includes('create-react')
      );
    }
  },
  'npx': {
    severity: 'high',
    reason: '禁止使用npx创建项目',
    alternatives: ['使用HTML统一框架开发页面'],
    blocked: true,
    checkArgs: (args) => {
      return args.some(arg => 
        arg.includes('create-vue') ||
        arg.includes('create-react-app')
      );
    }
  },
  // 配置修改类
  'openclaw': {
    severity: 'medium',
    reason: 'OpenClaw配置修改有风险',
    alternatives: [
      '查阅文档: ~/.openclaw/workspace/docs/',
      '使用 gateway config patch 进行部分更新',
      '运行 openclaw doctor 验证配置'
    ],
    blocked: false,
    checkArgs: (args) => {
      return args.some(arg => 
        arg.includes('config set') ||
        arg.includes('config apply')
      );
    }
  },
  'gateway': {
    severity: 'medium',
    reason: 'Gateway配置修改需谨慎',
    alternatives: [
      '使用 gateway config patch',
      '运行 openclaw doctor 验证'
    ],
    blocked: false,
    checkArgs: (args) => {
      return args.some(arg => 
        arg.includes('config') && arg.includes('set')
      );
    }
  }
};

// 需要特殊检查的命令（通过参数匹配）
const COMMAND_PATTERNS = [
  { pattern: /^rm\s+-rf?\s+/i, command: 'rm', reason: '强制递归删除' },
  { pattern: /^rm\s+-r\s+/i, command: 'rm', reason: '递归删除目录' },
  { pattern: /^rmdir\s+/i, command: 'rmdir', reason: '删除目录，可能误删重要数据' },
  { pattern: /^mv\s+\S+\s+\/tmp$/i, command: 'mv', reason: '移动到/tmp（删除意图）' },
  { pattern: /^npm\s+create\s+vue/i, command: 'npm', reason: '创建Vue应用' },
  { pattern: /^npx\s+create-vue/i, command: 'npx', reason: '创建Vue应用' },
  { pattern: /^npm\s+init\s+vue/i, command: 'npm', reason: '初始化Vue项目' },
  { pattern: /^npx\s+create-react/i, command: 'npx', reason: '创建React应用' }
];

/**
 * 解析命令
 * @param {string} command - 原始命令
 * @returns {object} 解析后的命令对象
 */
function parseCommand(command) {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const base = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  // 提取标志
  const flags = args.filter(arg => arg.startsWith('-'));
  
  return {
    raw: trimmed,
    base,
    args,
    flags,
    hasPipe: trimmed.includes('|'),
    hasRedirect: trimmed.includes('>') || trimmed.includes('>>'),
    hasSudo: args.includes('sudo')
  };
}

/**
 * 检查命令是否危险
 * @param {string} command - 要检查的命令
 * @returns {object} 检查结果
 */
function checkCommand(command) {
  const parsed = parseCommand(command);
  let result = {
    blocked: false,
    dangerous: false,
    reason: null,
    alternatives: [],
    command: parsed.base,
    severity: null
  };
  
  // 1. 精确匹配
  if (DANGEROUS_COMMANDS[parsed.base]) {
    const config = DANGEROUS_COMMANDS[parsed.base];
    
    // 如果有参数检查函数
    if (config.checkArgs && config.checkArgs(parsed.args)) {
      result.dangerous = true;
      result.blocked = config.blocked;
      result.reason = config.reason;
      result.alternatives = config.alternatives;
      result.severity = config.severity;
      return result;
    }
    
    // 如果是精确匹配且需要拦截
    if (config.blocked) {
      // 特殊处理 rm：只拦截带参数的
      if (parsed.base === 'rm' && parsed.args.length > 0) {
        result.dangerous = true;
        result.blocked = true;
        result.reason = config.reason;
        result.alternatives = config.alternatives;
        result.severity = config.severity;
        return result;
      }
    }
  }
  
  // 2. 模式匹配
  for (const pattern of COMMAND_PATTERNS) {
    if (pattern.pattern.test(command)) {
      const config = DANGEROUS_COMMANDS[pattern.command];
      result.dangerous = true;
      result.blocked = config?.blocked || true;
      result.reason = pattern.reason || config?.reason;
      result.alternatives = config?.alternatives || [];
      result.severity = config?.severity || 'high';
      result.pattern = pattern.pattern.source;
      return result;
    }
  }
  
  // 3. 上下文检查
  // 检查是否有管道传递到 rm
  if (command.includes('|') && command.match(/rm\s+/)) {
    result.dangerous = true;
    result.blocked = true;
    result.reason = '管道传递到rm，可能导致误删';
    result.alternatives = ['使用 find 命令先预览要删除的文件'];
    result.severity = 'high';
    return result;
  }
  
  return result;
}

/**
 * 生成拦截消息
 * @param {object} checkResult - 检查结果
 * @returns {string} 格式化消息
 */
function formatBlockMessage(checkResult) {
  const severityEmoji = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };
  
  let message = `\n${severityEmoji[checkResult.severity] || '⚠️'} **危险命令拦截**\n\n`;
  message += `检测到危险命令：\`${checkResult.command}\`\n`;
  message += `原因：${checkResult.reason}\n`;
  
  if (checkResult.alternatives && checkResult.alternatives.length > 0) {
    message += `\n**替代方案：**\n`;
    checkResult.alternatives.forEach((alt, i) => {
      message += `${i + 1}. \`${alt}\`\n`;
    });
  }
  
  message += `\n请使用安全的替代方案，或咨询系统管理员。`;
  
  return message;
}

/**
 * Express中间件
 * @param {object} req - 请求对象
 * @param {object} res - 响应对象
 * @param {function} next - 下一个中间件
 */
function commandInterceptor(req, res, next) {
  // 只拦截 exec 相关的路由
  const execRoutes = ['/exec', '/command', '/run'];
  const isExecRoute = execRoutes.some(route => req.path.startsWith(route));
  
  if (!isExecRoute) {
    return next();
  }
  
  // 获取命令
  const command = req.body.command || req.body.cmd || req.query.command || '';
  
  if (!command) {
    return next();
  }
  
  // 检查命令
  const checkResult = checkCommand(command);
  
  if (checkResult.dangerous) {
    console.log(`[CommandInterceptor] 拦截危险命令: ${command}`);
    console.log(`[CommandInterceptor] 原因: ${checkResult.reason}`);
    
    if (checkResult.blocked) {
      return res.status(403).json({
        success: false,
        error: 'dangerous_command_blocked',
        message: formatBlockMessage(checkResult),
        blocked: true,
        command: command,
        reason: checkResult.reason,
        alternatives: checkResult.alternatives
      });
    } else {
      // 警告但不阻止
      return res.status(200).json({
        success: true,
        warning: 'dangerous_command_warning',
        message: formatBlockMessage(checkResult),
        blocked: false,
        command: command,
        reason: checkResult.reason,
        alternatives: checkResult.alternatives
      });
    }
  }
  
  next();
}

/**
 * 直接调用的拦截函数（用于代码中）
 * @param {string} command - 要执行的命令
 * @returns {object} 检查结果
 */
function intercept(command) {
  return checkCommand(command);
}

/**
 * 验证命令是否安全
 * @param {string} command - 要验证的命令
 * @returns {boolean} 是否可以执行
 */
function isSafe(command) {
  const result = checkCommand(command);
  return !result.dangerous || !result.blocked;
}

module.exports = {
  commandInterceptor,
  intercept,
  isSafe,
  checkCommand,
  formatBlockMessage,
  DANGEROUS_COMMANDS,
  COMMAND_PATTERNS
};

// 导出别名
module.exports.default = module.exports;