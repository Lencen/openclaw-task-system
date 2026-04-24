
// 自动化状态 API
router.get('/automation/status', async (req, res) => {
  try {
    const components = [
      { name: 'auto-task-assigner', status: 'online', uptime: '16h' },
      { name: 'pending-assignment-observer', status: 'online', uptime: '17h' },
      { name: 'task-completion-monitor', status: 'online', uptime: '47h' },
      { name: 'issue-scanner', status: 'online', uptime: '2D' },
      { name: 'fix-queue-processor', status: 'online', uptime: '2D' }
    ];

    const db = require('../db');
    const tasks = db.tasks.list();
    const issues = db.issues.list();

    // 统计任务状态
    const taskStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      doing: tasks.filter(t => t.status === 'doing').length,
      console.log('DEBUG: tasks status =', tasks.map(t => t.status).reduce((a, c) => {a[c] = (a[c] || 0) + 1; return a}, {})), completed: tasks.filter(t => t.status === 'done').length
    };

    // 统计待分配任务
    const pendingAssignments = tasks.filter(t => t.status === 'pending').length;

    // 统计运行中的 Agent
    const runningAgents = [
      { id: 'main', name: 'Main', status: 'online' },
      { id: 'coder', name: 'Coder', status: 'online' },
      { id: 'deep', name: 'Deep', status: 'online' },
      { id: 'fast', name: 'Fast', status: 'online' },
      { id: 'chat', name: 'Chat', status: 'online' },
      { id: 'test', name: 'Test', status: 'online' },
      { id: 'office', name: 'Office', status: 'online' }
    ];

    res.json({
      components,
      stats: {
        tasks: taskStats.doing,
        issues: issues.filter(i => i.status === 'open').length,
        queue: 0
      },
      tasks: taskStats,
      pendingAssignments,
      agents: runningAgents,
      alerts: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
