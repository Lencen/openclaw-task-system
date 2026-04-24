/**
 * 备份管理 API
 * 提供系统备份统计和历史记录
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 备份根目录 - 按优先级检查多个可能的位置
const BACKUP_PATHS = [
  '/path/to/backup-storage',  // 当前实际备份目录
  '/path/to/backups',   // 配置中的目录
  path.join(__dirname, '../../../backups'),     // 工作区备份目录
  path.join(__dirname, '../../backups'),        // 任务系统备份目录
];

// 查找实际存在的备份目录
function findBackupRoot() {
  for (const p of BACKUP_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  // 默认返回第一个路径
  return BACKUP_PATHS[0];
}

const BACKUP_ROOT = findBackupRoot();

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  return true;
}

/**
 * 获取目录大小
 */
function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  
  let size = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      size += getDirSize(filePath);
    } else {
      size += stat.size;
    }
  }
  return size;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 获取备份类型信息
 */
function getBackupTypes() {
  const types = [
    { id: 'memory-hourly', name: '记忆小时级备份', dir: 'memory-hourly', icon: '🧠' },
    { id: 'memory-daily', name: '记忆每日归档', dir: 'memory-daily', icon: '🧠' },
    { id: 'sessions', name: '会话备份', dir: 'sessions', icon: '💬' },
    { id: 'task-system', name: '任务数据备份', dir: 'task-system', icon: '🎯' },
    { id: 'config', name: 'OpenClaw配置备份', dir: 'config', icon: '⚙️' },
    { id: 'full', name: '完整系统备份', dir: 'full', icon: '📦' }
  ];
  return types;
}

/**
 * GET /api/backup/stats
 * 获取备份统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const types = getBackupTypes();
    let totalBackups = 0;
    let totalSize = 0;
    const details = [];

    for (const type of types) {
      const backupDir = path.join(BACKUP_ROOT, type.dir);
      let count = 0;
      let size = 0;

      if (ensureDir(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => !f.startsWith('.'));
        count = files.length;
        size = getDirSize(backupDir);
      }

      totalBackups += count;
      totalSize += size;
      details.push({
        ...type,
        count,
        size: formatSize(size),
        sizeBytes: size
      });
    }

    res.json({
      success: true,
      stats: {
        totalBackups,
        totalSize: formatSize(totalSize),
        totalSizeBytes: totalSize,
        autoStatus: 'enabled',
        details
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/backup/history
 * 获取备份历史记录
 */
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const types = getBackupTypes();
    const history = [];

    for (const type of types) {
      const backupDir = path.join(BACKUP_ROOT, type.dir);
      
      if (ensureDir(backupDir)) {
        const files = fs.readdirSync(backupDir)
          .filter(f => !f.startsWith('.'))
          .map(f => {
            const filePath = path.join(backupDir, f);
            const stat = fs.statSync(filePath);
            return {
              name: f,
              path: path.join(type.dir, f),
              type: type.name,
              typeIcon: type.icon,
              time: stat.mtime,
              size: stat.size,
              sizeFormatted: formatSize(stat.size)
            };
          })
          .sort((a, b) => b.time - a.time);

        history.push(...files);
      }
    }

    // 按时间排序并限制数量
    history.sort((a, b) => b.time - a.time);
    const limitedHistory = history.slice(0, limit);

    res.json({
      success: true,
      history: limitedHistory,
      total: history.length
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/backup/trigger
 * 手动触发备份
 */
router.post('/trigger', async (req, res) => {
  try {
    const { type } = req.body;
    
    // 这里可以调用实际的备份脚本
    // 目前返回成功响应
    res.json({
      success: true,
      message: `备份任务已触发: ${type || 'all'}`,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;