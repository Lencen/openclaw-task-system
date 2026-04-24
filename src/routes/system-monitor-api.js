/**
 * System Monitor API - 系统监控数据接口
 * 提供 CPU、内存、磁盘、进程等系统资源信息
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const fs = require('fs');

// 读取 /proc/loadavg 获取系统负载
function getLoadAvg() {
  try {
    const content = fs.readFileSync('/proc/loadavg', 'utf8').trim();
    const parts = content.split(/\s+/);
    return {
      load1: parseFloat(parts[0]),
      load5: parseFloat(parts[1]),
      load15: parseFloat(parts[2]),
      running: parseInt(parts[3].split('/')[0]),
      total: parseInt(parts[3].split('/')[1]),
      lastPid: parseInt(parts[4])
    };
  } catch (e) {
    return { load1: 0, load5: 0, load15: 0, running: 0, total: 0, lastPid: 0, error: e.message };
  }
}

// 读取 /proc/meminfo 获取内存信息
function getMemInfo() {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const lines = content.split('\n');
    const info = {};
    
    lines.forEach(line => {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) {
        info[match[1]] = parseInt(match[2]);
      }
    });
    
    const total = info.MemTotal || 0;
    const free = info.MemFree || 0;
    const available = info.MemAvailable || free;
    const buffers = info.Buffers || 0;
    const cached = info.Cached || 0;
    const used = total - available;
    
    return {
      total: Math.round(total / 1024), // MB
      free: Math.round(free / 1024),
      available: Math.round(available / 1024),
      used: Math.round(used / 1024),
      buffers: Math.round(buffers / 1024),
      cached: Math.round(cached / 1024),
      percent: total > 0 ? Math.round((used / total) * 100) : 0,
      swapTotal: Math.round((info.SwapTotal || 0) / 1024),
      swapFree: Math.round((info.SwapFree || 0) / 1024)
    };
  } catch (e) {
    return { total: 0, used: 0, percent: 0, error: e.message };
  }
}

// 获取系统运行时间
function getUptime() {
  try {
    const content = fs.readFileSync('/proc/uptime', 'utf8').trim();
    const uptimeSeconds = parseFloat(content.split(' ')[0]);
    
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    return {
      totalSeconds: uptimeSeconds,
      days,
      hours,
      minutes,
      formatted: `${days}天 ${hours}时 ${minutes}分`,
      bootTime: new Date(Date.now() - uptimeSeconds * 1000).toISOString()
    };
  } catch (e) {
    return { totalSeconds: 0, days: 0, hours: 0, minutes: 0, formatted: 'N/A', error: e.message };
  }
}

// 获取 CPU 信息
function getCPUInfo() {
  try {
    const content = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const lines = content.split('\n');
    let cores = 0;
    let model = 'Unknown';
    
    lines.forEach(line => {
      if (line.startsWith('processor')) cores++;
      if (line.startsWith('model name') && model === 'Unknown') {
        model = line.split(':')[1].trim();
      }
    });
    
    return { cores, model };
  } catch (e) {
    return { cores: 1, model: 'Unknown', error: e.message };
  }
}

// 执行命令并返回 Promise
function execCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message, output: '' });
      } else {
        resolve({ output: stdout.trim() });
      }
    });
  });
}

// 解析 df -h 输出
function parseDiskUsage(output) {
  try {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const disks = [];
    
    lines.forEach(line => {
      const parts = line.split(/\s+/);
      if (parts.length >= 6 && parts[0].startsWith('/dev')) {
        const filesystem = parts[0];
        const size = parts[1];
        const used = parts[2];
        const avail = parts[3];
        const percentStr = parts[4];
        const mount = parts[5];
        
        const percent = parseInt(percentStr.replace('%', '')) || 0;
        
        disks.push({
          filesystem,
          size,
          used,
          available: avail,
          percent,
          mount
        });
      }
    });
    
    return disks;
  } catch (e) {
    return [];
  }
}

// 获取进程列表
function parseProcessList(output) {
  try {
    const lines = output.split('\n').slice(1); // 跳过标题行
    const processes = [];
    
    lines.slice(0, 20).forEach(line => { // 只取前20个
      const parts = line.split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          user: parts[0],
          pid: parts[1],
          cpu: parseFloat(parts[2]) || 0,
          mem: parseFloat(parts[3]) || 0,
          vsz: parts[4],
          rss: parts[5],
          stat: parts[7],
          start: parts[8],
          time: parts[9],
          command: parts.slice(10).join(' ').substring(0, 50)
        });
      }
    });
    
    return processes;
  } catch (e) {
    return [];
  }
}

// 获取 Gateway 状态
async function getGatewayStatus() {
  try {
    // 检查 openclaw gateway 是否运行
    const result = await execCommand('pgrep -f "openclaw gateway" || echo "not_running"');
    const isRunning = result.output !== 'not_running' && result.output.length > 0;
    
    return {
      running: isRunning,
      pid: isRunning ? result.output.split('\n')[0] : null,
      status: isRunning ? 'online' : 'offline'
    };
  } catch (e) {
    return { running: false, status: 'unknown', error: e.message };
  }
}

// 系统状态 API
router.get('/stats', async (req, res) => {
  try {
    const [diskResult, processResult, gatewayStatus] = await Promise.all([
      execCommand('df -h 2>/dev/null || df'),
      execCommand('ps aux --sort=-%cpu 2>/dev/null || ps aux'),
      getGatewayStatus()
    ]);
    
    const loadAvg = getLoadAvg();
    const memInfo = getMemInfo();
    const uptime = getUptime();
    const cpuInfo = getCPUInfo();
    const disks = parseDiskUsage(diskResult.output);
    const processes = parseProcessList(processResult.output);
    
    // 计算总体状态
    const warnings = [];
    if (loadAvg.load1 > cpuInfo.cores) warnings.push('CPU负载较高');
    if (memInfo.percent > 80) warnings.push('内存使用率高');
    
    const mainDisk = disks.find(d => d.mount === '/') || disks[0];
    if (mainDisk && mainDisk.percent > 80) warnings.push('磁盘空间不足');
    
    // 计算整体健康状态
    let healthStatus = 'healthy';
    if (warnings.length > 0) healthStatus = 'warning';
    if (loadAvg.load1 > cpuInfo.cores * 2 || memInfo.percent > 95 || (mainDisk && mainDisk.percent > 95)) {
      healthStatus = 'danger';
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      health: {
        status: healthStatus,
        warnings
      },
      cpu: {
        ...cpuInfo,
        load: loadAvg,
        usagePercent: Math.min(100, Math.round((loadAvg.load1 / cpuInfo.cores) * 100))
      },
      memory: memInfo,
      disk: {
        devices: disks,
        main: mainDisk || null
      },
      uptime,
      gateway: gatewayStatus,
      topProcesses: processes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 简化的系统状态 API (轻量级)
router.get('/quick', async (req, res) => {
  try {
    const loadAvg = getLoadAvg();
    const memInfo = getMemInfo();
    const uptime = getUptime();
    const cpuInfo = getCPUInfo();
    const gatewayStatus = await getGatewayStatus();
    
    const mainDiskResult = await execCommand('df -h / 2>/dev/null | tail -1');
    const diskParts = mainDiskResult.output.split(/\s+/);
    const diskPercent = diskParts[4] ? parseInt(diskParts[4].replace('%', '')) : 0;
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      cpu: {
        cores: cpuInfo.cores,
        load: loadAvg.load1,
        percent: Math.min(100, Math.round((loadAvg.load1 / cpuInfo.cores) * 100))
      },
      memory: {
        percent: memInfo.percent,
        used: memInfo.used,
        total: memInfo.total
      },
      disk: {
        percent: diskPercent
      },
      uptime: uptime.formatted,
      gateway: gatewayStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;