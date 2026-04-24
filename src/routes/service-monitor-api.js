#!/usr/bin/env node
/**
 * 服务监控 API - 全面监控解决方案
 * 覆盖层次：
 * 1. 硬件层 - CPU、内存、磁盘、温度
 * 2. 网络层 - 带宽、连接数、延迟、端口
 * 3. 服务层 - 进程、端口、响应时间、健康状态
 */

const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// 数据存储
const MONITOR_DATA_PATH = path.join(__dirname, '../data/monitor-data.json');
let monitorData = {
  hardware: {
    cpu: { usage: 0, cores: 0, load: [] },
    memory: { total: 0, used: 0, free: 0, percent: 0 },
    disk: [],
    temperature: {}
  },
  network: {
    interfaces: [],
    connections: 0,
    bandwidth: { upload: 0, download: 0 }
  },
  services: {
    list: [],
    healthy: 0,
    unhealthy: 0
  },
  history: [],
  lastUpdate: Date.now()
};

// 初始化默认数据
function initMonitorData() {
  // CPU 信息
  const cpus = os.cpus();
  monitorData.hardware.cpu.cores = cpus.length;
  
  // 内存信息
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  monitorData.hardware.memory = {
    total: totalMem,
    used: totalMem - freeMem,
    free: freeMem,
    percent: Math.round(((totalMem - freeMem) / totalMem) * 100)
  };

  // 磁盘信息
  monitorData.hardware.disk = getDiskUsage();

  // 网络接口
  monitorData.network.interfaces = getNetworkInterfaces();

  // 服务列表
  monitorData.services.list = getServicesList();
  
  return monitorData;
}

// 获取磁盘使用情况
function getDiskUsage() {
  return new Promise((resolve) => {
    exec('df -h / | tail -1', (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }
      const parts = stdout.trim().split(/\s+/);
      resolve([{
        filesystem: parts[0] || 'unknown',
        size: parts[1] || '0',
        used: parts[2] || '0',
        avail: parts[3] || '0',
        percent: parseInt(parts[4]) || 0,
        mount: parts[5] || '/'
      }]);
    });
  });
}

// 获取网络接口信息
function getNetworkInterfaces() {
  const nets = os.networkInterfaces();
  const result = [];
  
  for (const [name, interfaces] of Object.entries(nets)) {
    for (const iface of interfaces) {
      if (!iface.internal && iface.family === 'IPv4') {
        result.push({
          name,
          address: iface.address,
          netmask: iface.netmask,
          family: iface.family
        });
      }
    }
  }
  
  return result;
}

// 获取服务列表
function getServicesList() {
  // 关键服务和进程
  const services = [
    { name: 'OpenClaw Gateway', process: 'openclaw-gateway', port: null, type: 'system' },
    { name: 'Task System', process: 'node.*task', port: 8080, type: 'application' },
    { name: 'Chrome Browser', process: 'chrome', port: null, type: 'browser' },
    { name: 'PM2', process: 'pm2', port: null, type: 'system' }
  ];

  return services.map(svc => ({
    ...svc,
    status: checkProcessStatus(svc.process),
    portStatus: svc.port ? checkPortStatus(svc.port) : null
  }));
}

// 检查进程状态
function checkProcessStatus(processName) {
  return new Promise((resolve) => {
    exec(`ps aux | grep -E "${processName}" | grep -v grep | head -1`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve('stopped');
      } else {
        resolve('running');
      }
    });
  });
}

// 检查端口状态
function checkPortStatus(port) {
  return new Promise((resolve) => {
    exec(`lsof -i :${port} | head -2`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve('closed');
      } else {
        resolve('open');
      }
    });
  });
}

// 更新监控数据
async function updateMonitorData() {
  try {
    // 更新 CPU 使用率
    const cpuUsage = await getCpuUsage();
    monitorData.hardware.cpu.usage = cpuUsage;
    
    // 更新内存
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    monitorData.hardware.memory = {
      total: totalMem,
      used: totalMem - freeMem,
      free: freeMem,
      percent: Math.round(((totalMem - freeMem) / totalMem) * 100)
    };

    // 更新磁盘
    monitorData.hardware.disk = await getDiskUsage();

    // 更新网络
    monitorData.network.connections = await getNetworkConnections();
    
    // 更新服务状态
    const services = getServicesList();
    let healthy = 0;
    let unhealthy = 0;
    
    for (const svc of services) {
      const status = await checkProcessStatus(svc.process);
      svc.status = status;
      if (status === 'running') healthy++;
      else unhealthy++;
    }
    
    monitorData.services.list = services;
    monitorData.services.healthy = healthy;
    monitorData.services.unhealthy = unhealthy;

    // 更新时间
    monitorData.lastUpdate = Date.now();

    // 保存到历史
    if (monitorData.history.length > 100) {
      monitorData.history.shift();
    }
    monitorData.history.push({
      timestamp: Date.now(),
      cpu: cpuUsage,
      memory: monitorData.hardware.memory.percent,
      services: { healthy, unhealthy }
    });

    // 保存到文件
    fs.writeFileSync(MONITOR_DATA_PATH, JSON.stringify(monitorData, null, 2));
    
    return monitorData;
  } catch (error) {
    console.error('更新监控数据失败:', error);
    return monitorData;
  }
}

// 获取 CPU 使用率
function getCpuUsage() {
  return new Promise((resolve) => {
    exec('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | sed "s/%us,//"', (error, stdout) => {
      if (error || !stdout.trim()) {
        // 备用方法
        const cpus = os.cpus();
        const total = cpus.length;
        const idle = cpus.filter(c => c.model.includes('idle')).length;
        resolve(Math.round(((total - idle) / total) * 100) || 0);
      } else {
        resolve(Math.round(parseFloat(stdout.trim()) * 100) || 0);
      }
    });
  });
}

// 获取网络连接数
function getNetworkConnections() {
  return new Promise((resolve) => {
    exec('ss -s | grep "TCP:" | awk \'{print $1}\' | cut -d: -f2', (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(0);
      } else {
        resolve(parseInt(stdout.trim()) || 0);
      }
    });
  });
}

// API: 获取监控数据
router.get('/data', async (req, res) => {
  try {
    const data = await updateMonitorData();
    res.json({
      success: true,
      data: data,
      message: '监控数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API: 获取硬件监控
router.get('/hardware', async (req, res) => {
  try {
    const data = await updateMonitorData();
    res.json({
      success: true,
      data: data.hardware,
      message: '硬件监控数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API: 获取网络监控
router.get('/network', async (req, res) => {
  try {
    const data = await updateMonitorData();
    res.json({
      success: true,
      data: data.network,
      message: '网络监控数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API: 获取服务监控
router.get('/services', async (req, res) => {
  try {
    const data = await updateMonitorData();
    res.json({
      success: true,
      data: data.services,
      message: '服务监控数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API: 获取历史数据
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = monitorData.history.slice(-limit);
    res.json({
      success: true,
      data: history,
      message: '历史数据获取成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API: 健康检查
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '2.0'
    },
    message: '服务健康'
  });
});

// 初始化
initMonitorData();

// 定时更新（每 5 秒）
setInterval(() => {
  updateMonitorData();
}, 5000);

module.exports = router;
