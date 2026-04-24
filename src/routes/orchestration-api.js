/**
 * Orchestration API Routes
 * 
 * Agent 编排系统的 REST API 路由
 * 
 * @version 1.0.0
 */

const express = require('express');
const { AgentOrchestrationSystem, AgentEventTypes } = require('../orchestration/index');

const router = express.Router();

// 创建全局编排实例（在生产环境中可能需要单例模式）
let orchestrationInstance = null;

function getOrchestration() {
  if (!orchestrationInstance) {
    orchestrationInstance = new AgentOrchestrationSystem({
      autoManagePhase: true,
      autoCheckCircuit: true,
      autoDetectExit: true,
    });
  }
  return orchestrationInstance;
}

// ============================================================================
// Phase Controller API
// ============================================================================

/**
 * GET /api/orchestration/phase
 * 获取当前阶段
 */
router.get('/phase', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const phase = orchestration.phaseController.getCurrentPhase();
    const history = orchestration.phaseController.getPhaseHistory(10);
    
    res.json({
      success: true,
      data: {
        currentPhase: phase,
        history,
      },
    });
  } catch (error) {
    console.error('Error getting phase:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/phase
 * 更新阶段（基于任务状态）
 */
router.post('/phase', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { taskStats, metadata = {} } = req.body;
    
    if (!taskStats) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskStats in request body',
      });
    }
    
    const result = await orchestration.updatePhase(taskStats, metadata);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error updating phase:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/phase/set
 * 手动设置阶段
 */
router.post('/phase/set', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { phase, reason = 'manual', metadata = {} } = req.body;
    
    if (!phase) {
      return res.status(400).json({
        success: false,
        error: 'Missing phase in request body',
      });
    }
    
    const result = await orchestration.phaseController.setPhase(phase, reason, metadata);
    
    res.json({
      success: true,
      data: {
        phase: result,
      },
    });
  } catch (error) {
    console.error('Error setting phase:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestration/phase/history
 * 获取阶段历史
 */
router.get('/phase/history', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const limit = parseInt(req.query.limit) || 10;
    const history = orchestration.phaseController.getPhaseHistory(limit);
    
    res.json({
      success: true,
      data: {
        history,
        count: history.length,
      },
    });
  } catch (error) {
    console.error('Error getting phase history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Circuit Breaker API
// ============================================================================

/**
 * GET /api/orchestration/circuit
 * 获取熔断器状态
 */
router.get('/circuit', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const snapshot = orchestration.circuitBreaker.getSnapshot();
    
    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error getting circuit status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/circuit/reset
 * 重置熔断器
 */
router.post('/circuit/reset', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    await orchestration.circuitBreaker.reset();
    
    res.json({
      success: true,
      data: {
        message: 'Circuit breaker reset successfully',
      },
    });
  } catch (error) {
    console.error('Error resetting circuit breaker:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/circuit/config
 * 更新熔断器配置
 */
router.post('/circuit/config', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const config = req.body;
    
    // 更新配置（需要重启实例才能生效，这里只是示例）
    orchestration.circuitBreaker.config = {
      ...orchestration.circuitBreaker.config,
      ...config,
    };
    
    res.json({
      success: true,
      data: {
        message: 'Circuit breaker config updated',
        config: orchestration.circuitBreaker.config,
      },
    });
  } catch (error) {
    console.error('Error updating circuit config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Exit Detector API
// ============================================================================

/**
 * POST /api/orchestration/exit-check
 * 检测是否应该退出
 */
router.post('/exit-check', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { response } = req.body;
    
    if (!response) {
      return res.status(400).json({
        success: false,
        error: 'Missing response in request body',
      });
    }
    
    const decision = orchestration.exitDetector.shouldExit(response);
    
    res.json({
      success: true,
      data: decision,
    });
  } catch (error) {
    console.error('Error checking exit:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestration/exit/status
 * 获取退出检测器状态
 */
router.get('/exit/status', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const snapshot = orchestration.exitDetector.getSnapshot();
    
    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    console.error('Error getting exit status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/exit/reset
 * 重置退出检测器
 */
router.post('/exit/reset', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    orchestration.exitDetector.reset();
    
    res.json({
      success: true,
      data: {
        message: 'Exit detector reset successfully',
      },
    });
  } catch (error) {
    console.error('Error resetting exit detector:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Allocation API
// ============================================================================

/**
 * POST /api/orchestration/allocate
 * 分配任务
 */
router.post('/allocate', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { tasks, options = {} } = req.body;
    
    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid tasks in request body',
      });
    }
    
    const result = await orchestration.allocateTasks(tasks, options);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error allocating tasks:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/allocate/single
 * 分配单个任务
 */
router.post('/allocate/single', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { task, options = {} } = req.body;
    
    if (!task) {
      return res.status(400).json({
        success: false,
        error: 'Missing task in request body',
      });
    }
    
    const result = orchestration.allocationEngine.allocateTask(task, options.agentFilter);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error allocating task:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestration/allocation/stats
 * 获取分配统计
 */
router.get('/allocation/stats', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const stats = orchestration.allocationEngine.getAllocationStats();
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting allocation stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestration/allocation/agents
 * 获取所有 Agent 状态
 */
router.get('/allocation/agents', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const agents = orchestration.allocationEngine.getAgentsStatus();
    
    res.json({
      success: true,
      data: {
        agents,
        count: agents.length,
      },
    });
  } catch (error) {
    console.error('Error getting agents status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/allocation/release
 * 释放任务
 */
router.post('/allocation/release', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { taskId, agentId } = req.body;
    
    if (!taskId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId or agentId in request body',
      });
    }
    
    orchestration.allocationEngine.releaseTask(taskId, agentId);
    
    res.json({
      success: true,
      data: {
        message: `Task ${taskId} released from ${agentId}`,
      },
    });
  } catch (error) {
    console.error('Error releasing task:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Event Bus API
// ============================================================================

/**
 * GET /api/orchestration/events
 * 获取事件历史
 */
router.get('/events', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const filter = {
      type: req.query.type,
      source: req.query.source,
      limit: parseInt(req.query.limit) || 50,
      from: req.query.from ? new Date(req.query.from) : undefined,
      to: req.query.to ? new Date(req.query.to) : undefined,
    };
    
    const events = orchestration.eventBus.getHistory(filter);
    
    res.json({
      success: true,
      data: {
        events,
        count: events.length,
      },
    });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestration/events/stats
 * 获取事件统计
 */
router.get('/events/stats', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const stats = orchestration.eventBus.getStatistics();
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting events stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/events/emit
 * 手动发布事件
 */
router.post('/events/emit', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const { type, source, data, metadata } = req.body;
    
    if (!type || !source) {
      return res.status(400).json({
        success: false,
        error: 'Missing type or source in request body',
      });
    }
    
    const event = await orchestration.eventBus.emit(type, source, data, metadata);
    
    res.json({
      success: true,
      data: {
        event,
        message: 'Event emitted successfully',
      },
    });
  } catch (error) {
    console.error('Error emitting event:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// System Status API
// ============================================================================

/**
 * GET /api/orchestration/status
 * 获取系统整体状态
 */
router.get('/status', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    const status = await orchestration.getSystemStatus();
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestration/reset
 * 重置整个编排系统
 */
router.post('/reset', async (req, res) => {
  try {
    const orchestration = getOrchestration();
    await orchestration.reset();
    
    res.json({
      success: true,
      data: {
        message: 'Orchestration system reset successfully',
      },
    });
  } catch (error) {
    console.error('Error resetting orchestration:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Helper API
// ============================================================================

/**
 * GET /api/orchestration
 * 获取 API 信息
 */
router.get('/', (req, res) => {
  res.json({
    name: 'Agent Orchestration API',
    version: '1.0.0',
    endpoints: {
      phase: {
        'GET /phase': 'Get current phase',
        'POST /phase': 'Update phase based on task stats',
        'POST /phase/set': 'Manually set phase',
        'GET /phase/history': 'Get phase history',
      },
      circuit: {
        'GET /circuit': 'Get circuit breaker status',
        'POST /circuit/reset': 'Reset circuit breaker',
        'POST /circuit/config': 'Update circuit breaker config',
      },
      exit: {
        'POST /exit-check': 'Check if should exit',
        'GET /exit/status': 'Get exit detector status',
        'POST /exit/reset': 'Reset exit detector',
      },
      allocation: {
        'POST /allocate': 'Allocate tasks',
        'POST /allocate/single': 'Allocate single task',
        'GET /allocation/stats': 'Get allocation statistics',
        'GET /allocation/agents': 'Get all agents status',
        'POST /allocation/release': 'Release task',
      },
      events: {
        'GET /events': 'Get event history',
        'GET /events/stats': 'Get event statistics',
        'POST /events/emit': 'Emit event',
      },
      system: {
        'GET /status': 'Get system status',
        'POST /reset': 'Reset orchestration system',
      },
    },
  });
});

module.exports = router;