/**
 * 系统检查 API
 * 提供系统检查清单的执行和结果查询接口
 */

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 路径配置
const WORKSPACE_DIR = '/path/to/workspace';
const SELF_CHECK_SCRIPT = path.join(WORKSPACE_DIR, 'scripts/self-check/self-check.sh');
const BUSINESS_CHECK_SCRIPT = path.join(WORKSPACE_DIR, 'scripts/self-check/business-check.sh');
const DATA_INTEGRITY_SCRIPT = path.join(WORKSPACE_DIR, 'task-system-v2/scripts/data-integrity-check.js');
const DEEP_CHECK_SCRIPT = path.join(WORKSPACE_DIR, 'task-system-v2/scripts/deep-data-check.js');

// 检查结果缓存
let lastCheckResults = null;
let lastCheckTime = null;

/**
 * 执行 shell 命令并返回结果
 */
function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: WORKSPACE_DIR,
      timeout: options.timeout || 30000,
      ...options
    }, (error, stdout, stderr) => {
      if (error && !options.ignoreError) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * 解析检查脚本输出
 */
function parseCheckOutput(output, prefix = '') {
  const results = {};
  const lines = output.split('\n');
  
  for (const line of lines) {
    // 匹配 ✅ 或 ❌ 或 ⚠️ 开头的行
    const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(✅|❌|⚠️|✓|✗)\s*(.+)/);
    if (match) {
      const status = match[2];
      const message = match[3].trim();
      
      // 根据关键词判断检查项
      if (message.includes('Gateway') && message.includes('状态')) {
        results['gateway_status'] = status === '✅' || status === '✓' ? 'pass' : 'fail';
      } else if (message.includes('重启次数')) {
        results['gateway_restarts'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('Chrome') || message.includes('进程')) {
        results['chrome_processes'] = status === '✅' ? 'pass' : 
          (status === '⚠️' ? 'warn' : 'fail');
      } else if (message.includes('负载')) {
        results['system_load'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('内存')) {
        results['memory_usage'] = status === '✅' ? 'pass' : 
          (status === '⚠️' ? 'warn' : 'fail');
      } else if (message.includes('磁盘')) {
        results['disk_usage'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('任务系统')) {
        results['task_system'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('PM2')) {
        results['pm2_processes'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('队列')) {
        results['task_queues'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('Agent')) {
        results['agents_status'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('自动化') || message.includes('全链路')) {
        results['automation_flow'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('飞书')) {
        results['feishu_connection'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('记忆')) {
        results['memory_sync'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('doing')) {
        results['doing_tasks'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('failed') || message.includes('积压')) {
        results['failed_tasks'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('超时')) {
        results['timeout_tasks'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('字段填充') || message.includes('字段完整')) {
        results['field_completeness'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('关联正确') || message.includes('错误关联')) {
        results['field_correctness'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('Token') || message.includes('token')) {
        results['token_stats'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('完整性')) {
        results['data_integrity'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('日志文件')) {
        results['large_logs'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('备份')) {
        results['backup_count'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('数据库')) {
        results['db_size'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('通信服务') || message.includes('WebSocket')) {
        results['gateway_comm'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('错误')) {
        results['log_errors'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('技能页面') || message.includes('技能访问')) {
        results['skill_pages'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('知识页面') || message.includes('知识访问')) {
        results['knowledge_pages'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('文档页面') || message.includes('文档访问')) {
        results['doc_pages'] = status === '✅' ? 'pass' : 'fail';
      } else if (message.includes('项目详情')) {
        results['project_detail'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('任务详情')) {
        results['task_detail'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('War Room') || message.includes('监控数据')) {
        results['warroom_data'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('统计') || message.includes('看板')) {
        results['dashboard_stats'] = status === '✅' ? 'pass' : 'warn';
      } else if (message.includes('关联链接') || message.includes('链接')) {
        results['related_links'] = status === '✅' ? 'pass' : 'fail';
      }
    }
  }
  
  return results;
}

/**
 * 获取检查清单数据
 */
router.get('/list', (req, res) => {
  const checklist = {
    system: {
      name: '系统层检查',
      icon: 'ri-server-line',
      description: '检查系统基础运行状态',
      items: [
        { id: 'gateway_status', name: 'Gateway 状态', threshold: 'running', autoFix: true },
        { id: 'gateway_restarts', name: 'Gateway 重启次数', threshold: '< 3 次/天', autoFix: false },
        { id: 'chrome_processes', name: '残留 Chrome 进程', threshold: '< 20 个', autoFix: true },
        { id: 'system_load', name: '系统负载', threshold: '< 2.0', autoFix: false },
        { id: 'memory_usage', name: '内存使用', threshold: '> 15% 可用', autoFix: true },
        { id: 'disk_usage', name: '磁盘空间', threshold: '> 15% 可用', autoFix: false },
        { id: 'gateway_comm', name: 'Gateway 通信服务', threshold: 'WebSocket 监听', autoFix: true },
        { id: 'log_errors', name: '日志错误', threshold: '< 10 条/小时', autoFix: false }
      ]
    },
    business: {
      name: '业务层检查',
      icon: 'ri-briefcase-line',
      description: '检查业务服务运行状态',
      items: [
        { id: 'task_system', name: '任务系统服务', threshold: '端口 8081 监听', autoFix: true },
        { id: 'pm2_processes', name: 'PM2 进程', threshold: 'auto-task-starter 运行', autoFix: true },
        { id: 'task_queues', name: '任务队列', threshold: '卡住任务 < 5 个', autoFix: false },
        { id: 'agents_status', name: 'Agent 状态', threshold: '至少 1 个活跃', autoFix: false },
        { id: 'automation_flow', name: '全链路自动化流程', threshold: '无中断点', autoFix: false },
        { id: 'feishu_connection', name: '飞书连接', threshold: 'WebSocket 正常', autoFix: false },
        { id: 'memory_sync', name: '记忆同步', threshold: '< 24 小时更新', autoFix: false }
      ]
    },
    data: {
      name: '数据层检查',
      icon: 'ri-database-2-line',
      description: '检查数据完整性和存储状态',
      items: [
        { id: 'doing_tasks', name: 'doing 任务数量', threshold: '< 5 个', autoFix: false },
        { id: 'failed_tasks', name: 'failed 任务积压', threshold: '< 10 个', autoFix: false },
        { id: 'timeout_tasks', name: '超时任务', threshold: '0 个', autoFix: false },
        { id: 'field_completeness', name: '字段填充完整性', threshold: '填充率 > 90%', autoFix: false },
        { id: 'field_correctness', name: '字段关联正确性', threshold: '无错误关联', autoFix: true },
        { id: 'token_stats', name: 'Token 统计检查', threshold: '有 Token 记录', autoFix: false },
        { id: 'data_integrity', name: '任务数据完整性', threshold: '字段完整', autoFix: true },
        { id: 'large_logs', name: '大日志文件', threshold: '< 50MB', autoFix: false },
        { id: 'backup_count', name: '备份文件数量', threshold: '< 100 个', autoFix: false },
        { id: 'db_size', name: '数据库大小', threshold: '< 500MB', autoFix: false }
      ]
    },
    display: {
      name: '展示层检查',
      icon: 'ri-eye-line',
      description: '检查页面访问和监控数据准确性',
      items: [
        { id: 'skill_pages', name: '技能页面访问', threshold: 'HTTP 200', autoFix: false },
        { id: 'knowledge_pages', name: '知识页面访问', threshold: 'HTTP 200', autoFix: false },
        { id: 'doc_pages', name: '文档页面访问', threshold: 'HTTP 200', autoFix: false },
        { id: 'project_detail', name: '项目详情页', threshold: '字段显示', autoFix: false },
        { id: 'task_detail', name: '任务详情页', threshold: '字段显示', autoFix: false },
        { id: 'warroom_data', name: 'War Room 数据准确性', threshold: '数据一致', autoFix: false },
        { id: 'dashboard_stats', name: '看板统计准确性', threshold: '统计正确', autoFix: false },
        { id: 'related_links', name: '关联链接有效性', threshold: '链接可访问', autoFix: false }
      ]
    }
  };
  
  res.json({ success: true, data: checklist });
});

/**
 * 一键执行所有检查
 */
router.post('/run-all', async (req, res) => {
  try {
    // 清除缓存以获取最新代码
    const modulePath = require.resolve('../scripts/check/run-all-checks');
    delete require.cache[modulePath];
    
    const checkRunner = require('../../scripts/check/run-all-checks');
    const record = await checkRunner.runAllChecks();
    
    res.json({
      success: true,
      record: {
        id: record.id,
        timestamp: record.timestamp,
        overallStatus: record.overallStatus,
        overallMessage: record.overallMessage,
        summary: record.summary,
        duration: record.duration
      }
    });
    
  } catch (error) {
    console.error('执行检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取检查记录列表
 */
router.get('/records', (req, res) => {
  try {
    const checkRunner = require('../../scripts/check/run-all-checks');
    const limit = parseInt(req.query.limit) || 20;
    const records = checkRunner.getRecords(limit);
    
    res.json({
      success: true,
      data: records,
      total: records.length
    });
    
  } catch (error) {
    console.error('获取检查记录失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取单条检查记录详情
 */
router.get('/records/:id', (req, res) => {
  try {
    const checkRunner = require('../../scripts/check/run-all-checks');
    const record = checkRunner.getRecordDetail(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: '记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: record
    });
    
  } catch (error) {
    console.error('获取检查记录详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 执行系统检查
 */
router.post('/check', async (req, res) => {
  try {
    const results = {};
    let totalIssues = 0;
    
    // 执行系统层检查
    if (fs.existsSync(SELF_CHECK_SCRIPT)) {
      try {
        const { stdout } = await execCommand(`${SELF_CHECK_SCRIPT} check`, { timeout: 60000 });
        Object.assign(results, parseCheckOutput(stdout, 'system'));
      } catch (err) {
        console.error('系统检查执行失败:', err.message);
        // 部分失败不影响整体
      }
    }
    
    // 执行业务层检查
    if (fs.existsSync(BUSINESS_CHECK_SCRIPT)) {
      try {
        const { stdout } = await execCommand(`${BUSINESS_CHECK_SCRIPT} check`, { timeout: 60000 });
        Object.assign(results, parseCheckOutput(stdout, 'business'));
      } catch (err) {
        console.error('业务检查执行失败:', err.message);
      }
    }
    
    // 统计问题数
    for (const [key, value] of Object.entries(results)) {
      if (value === 'fail') totalIssues++;
    }
    
    // 缓存结果
    lastCheckResults = results;
    lastCheckTime = new Date().toISOString();
    
    res.json({
      success: true,
      results,
      issues: totalIssues,
      checkedAt: lastCheckTime
    });
    
  } catch (error) {
    console.error('检查执行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取上次检查结果
 */
router.get('/results', (req, res) => {
  res.json({
    success: true,
    results: lastCheckResults || {},
    checkedAt: lastCheckTime
  });
});

/**
 * 执行自动修复
 */
router.post('/fix', async (req, res) => {
  try {
    let fixed = 0;
    const details = [];
    
    // 执行系统修复
    if (fs.existsSync(SELF_CHECK_SCRIPT)) {
      try {
        const { stdout } = await execCommand(`${SELF_CHECK_SCRIPT} fix`, { timeout: 60000 });
        details.push({ category: 'system', output: stdout });
        fixed++;
      } catch (err) {
        console.error('系统修复失败:', err.message);
      }
    }
    
    // 执行数据修复（如果请求）
    if (req.query.data === 'true' && fs.existsSync(DATA_INTEGRITY_SCRIPT)) {
      try {
        const { stdout } = await execCommand(`node ${DATA_INTEGRITY_SCRIPT} --fix`, { timeout: 120000 });
        details.push({ category: 'data', output: stdout });
        fixed++;
      } catch (err) {
        console.error('数据修复失败:', err.message);
      }
    }
    
    res.json({
      success: true,
      fixed,
      details
    });
    
  } catch (error) {
    console.error('修复执行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取检查历史
 */
router.get('/history', async (req, res) => {
  const logFile = '/path/to/workspace/logs/self-check.log';
  
  try {
    if (!fs.existsSync(logFile)) {
      return res.json({ success: true, data: [] });
    }
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').slice(-100);
    
    const history = lines
      .filter(line => line.includes('自检完成'))
      .map(line => {
        const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*发现问题:\s*(\d+)\s*个/);
        if (match) {
          return {
            time: match[1],
            issues: parseInt(match[2])
          };
        }
        return null;
      })
      .filter(Boolean);
    
    res.json({ success: true, data: history });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取告警列表
 */
router.get('/alerts', async (req, res) => {
  const alertFile = '/path/to/workspace/logs/self-check-alerts.log';
  
  try {
    if (!fs.existsSync(alertFile)) {
      return res.json({ success: true, data: [] });
    }
    
    const content = fs.readFileSync(alertFile, 'utf-8');
    const lines = content.split('\n').slice(-50);
    
    const alerts = lines
      .filter(line => line.trim())
      .map(line => {
        const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*(.+)/);
        if (match) {
          return {
            time: match[1],
            message: match[2],
            severity: match[2].includes('过多') || match[2].includes('过高') ? 'warning' : 'error'
          };
        }
        return null;
      })
      .filter(Boolean);
    
    res.json({ success: true, data: alerts });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;