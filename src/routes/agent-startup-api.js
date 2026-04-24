/**
 * Agent启动和管理API v1.0
 * 集成到task-system-v2的HTTP服务器
 */

const express = require('express');
const router = express.Router();
const agentStarter = require('../../scripts/agent-manager/agent-starter');

/**
 * GET /api/agents/status
 * 获取所有Agents状态
 */
router.get('/api/agents/status', async (req, res) => {
  try {
    const status = agentStarter.getAllAgentsStatus();
    res.json({
      success: true,
      data: status,
      summary: {
        total: status.length,
        online: status.filter(a => a.status === 'online').length,
        idle: status.filter(a => a.status === 'idle').length,
        offline: status.filter(a => a.status === 'offline' || a.status === 'unknown').length,
        activeRate: Math.round((status.filter(a => a.status === 'online' || a.status === 'idle').length / status.length) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agents/start
 * 启动指定Agent
 * Body: { agent: <agent_id> }
 */
router.post('/api/agents/start', async (req, res) => {
  try {
    const { agent } = req.body;

    if (!agent) {
      return res.status(400).json({
        success: false,
        error: 'Missing agent parameter'
      });
    }

    const result = await agentStarter.startAgent(agent);

    if (result.success) {
      res.json({
        success: true,
        data: result,
        message: `Agent ${agent} startup initiated`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agents/start-all
 * 启动所有Agents
 */
router.post('/api/agents/start-all', async (req, res) => {
  try {
    const results = await agentStarter.startAllAgents();
    res.json({
      success: true,
      data: results,
      message: 'All agents startup initiated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agents/recover
 * 自动恢复离线Agents
 */
router.post('/api/agents/recover', async (req, res) => {
  try {
    const result = await agentStarter.recoverOfflineAgents();
    res.json({
      success: true,
      data: result,
      message: `Recovered ${result.recovered}/${result.total} agents`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agents/test
 * 测试Agent功能
 */
router.get('/api/agents/test', async (req, res) => {
  try {
    const testResult = agentStarter.testAgents();
    res.json({
      success: true,
      data: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agents/config
 * 获取Agent配置信息
 */
router.get('/api/agents/config', async (req, res) => {
  try {
    res.json({
      success: true,
      data: agentStarter.AGENT_CONFIG
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
