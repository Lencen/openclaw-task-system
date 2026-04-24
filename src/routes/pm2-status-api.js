/**
 * PM2 服务状态 API
 */
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

// 获取 PM2 服务状态
router.get('/pm2/status', async (req, res) => {
  try {
    const result = await execPromise('pm2 jlist');
    const processes = JSON.parse(result);
    
    const services = processes.map(p => ({
      name: p.name,
      status: p.pm2_env?.status || 'unknown',
      pid: p.pid,
      uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
      restartCount: p.pm2_env?.restart_time || 0,
      cpu: p.monit?.cpu || 0,
      memory: p.monit?.memory || 0
    }));
    
    const online = services.filter(s => s.status === 'online').length;
    const total = services.length;
    
    res.json({
      success: true,
      data: services,
      summary: {
        total,
        online,
        offline: total - online,
        health: total > 0 ? Math.round((online / total) * 100) : 100
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

module.exports = router;
