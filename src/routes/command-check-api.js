/**
 * Command Check API - 命令检查接口
 * 提供命令安全检查服务，供Agent在执行命令前调用
 */

const express = require('express');
const router = express.Router();
const { checkCommand, formatBlockMessage, isSafe, DANGEROUS_COMMANDS } = require('../middleware/command-interceptor');

/**
 * POST /api/command/check
 * 检查命令是否安全
 * Body: { command: "rm -rf file" }
 */
router.post('/check', (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'missing_command',
        message: '请提供要检查的命令'
      });
    }
    
    const result = checkCommand(command);
    
    res.json({
      success: true,
      command: command,
      safe: !result.dangerous,
      blocked: result.blocked,
      reason: result.reason,
      alternatives: result.alternatives,
      severity: result.severity
    });
  } catch (error) {
    console.error('[Command Check API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * POST /api/command/check-batch
 * 批量检查命令
 * Body: { commands: ["rm file", "ls"] }
 */
router.post('/check-batch', (req, res) => {
  try {
    const { commands } = req.body;
    
    if (!Array.isArray(commands)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_format',
        message: '请提供命令数组'
      });
    }
    
    const results = commands.map(cmd => ({
      command: cmd,
      ...checkCommand(cmd)
    }));
    
    const summary = {
      total: commands.length,
      safe: results.filter(r => !r.dangerous).length,
      dangerous: results.filter(r => r.dangerous).length,
      blocked: results.filter(r => r.blocked).length
    };
    
    res.json({
      success: true,
      summary,
      results
    });
  } catch (error) {
    console.error('[Command Check API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * GET /api/command/rules
 * 获取拦截规则列表
 */
router.get('/rules', (req, res) => {
  try {
    const rules = Object.entries(DANGEROUS_COMMANDS).map(([cmd, config]) => ({
      command: cmd,
      severity: config.severity,
      reason: config.reason,
      blocked: config.blocked,
      alternatives: config.alternatives
    }));
    
    res.json({
      success: true,
      count: rules.length,
      rules
    });
  } catch (error) {
    console.error('[Command Check API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * POST /api/command/safe-execute
 * 安全执行命令（带拦截）
 * Body: { command: "ls -la", timeout: 30 }
 */
router.post('/safe-execute', (req, res) => {
  try {
    const { command, timeout = 30 } = req.body;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'missing_command',
        message: '请提供要执行的命令'
      });
    }
    
    // 先检查命令
    const check = checkCommand(command);
    
    if (check.blocked) {
      return res.status(403).json({
        success: false,
        error: 'command_blocked',
        blocked: true,
        message: formatBlockMessage(check),
        reason: check.reason,
        alternatives: check.alternatives
      });
    }
    
    if (check.dangerous) {
      // 危险命令返回警告但不阻止
      return res.status(200).json({
        success: true,
        warning: true,
        message: formatBlockMessage(check),
        command,
        reason: check.reason,
        alternatives: check.alternatives
      });
    }
    
    // 安全命令，继续执行
    const { exec } = require('child_process');
    exec(command, { timeout: timeout * 1000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          command,
          error: error.message,
          code: error.code
        });
      }
      
      res.json({
        success: true,
        command,
        stdout: stdout.substring(0, 100000), // 限制输出长度
        stderr: stderr.substring(0, 10000)
      });
    });
  } catch (error) {
    console.error('[Command Check API] Error:', error);
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: error.message
    });
  }
});

module.exports = router;