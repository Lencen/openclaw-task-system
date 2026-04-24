/**
 * Execution Logs Data Access Layer
 * 处理执行日志文件
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
const LOGS_FILE = path.join(DATA_DIR, 'execution-logs.json');

/**
 * 初始化数据目录
 */
function initDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 添加执行日志
 */
function addLog(log) {
  initDir();
  
  // 读取现有日志
  let logs = [];
  if (fs.existsSync(LOGS_FILE)) {
    try {
      const content = fs.readFileSync(LOGS_FILE, 'utf8');
      logs = JSON.parse(content);
    } catch (e) {
      logs = [];
    }
  }
  
  // 添加新日志
  const entry = {
    id: log.id || `log-${Date.now()}`,
    timestamp: log.timestamp || new Date().toISOString(),
    ...log
  };
  
  logs.push(entry);
  
  // 写回文件
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
  
  return entry;
}

/**
 * 读取所有执行日志
 */
function listLogs() {
  if (!fs.existsSync(LOGS_FILE)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(LOGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('读取执行日志失败:', error.message);
    return [];
  }
}

/**
 * 获取最新日志
 * @param {number} limit - 返回数量限制
 */
function getLatestLogs(limit = 100) {
  const logs = listLogs();
  return logs.slice(-limit);
}

/**
 * 清除所有日志
 */
function clearLogs() {
  if (!fs.existsSync(LOGS_FILE)) {
    return 0;
  }
  
  try {
    const content = fs.readFileSync(LOGS_FILE, 'utf8');
    const logs = JSON.parse(content);
    const count = logs.length;
    
    fs.writeFileSync(LOGS_FILE, '[]', 'utf8');
    return count;
  } catch (error) {
    console.error('清除执行日志失败:', error.message);
    return 0;
  }
}

/**
 * 检查文件是否存在
 */
function fileExists() {
  return fs.existsSync(LOGS_FILE);
}

module.exports = {
  addLog,
  listLogs,
  getLatestLogs,
  clearLogs,
  fileExists,
  LOGS_FILE
};
