/**
 * System Monitor API v3 - 全面监控解决方案
 * 
 * 提供硬件层、网络层、服务层的完整监控能力
 * 
 * @version 3.0.0
 * @date 2026-03-20
 */

const express = require('express');
const router = express.Router();
const { exec, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ============================================
// 辅助函数
// ============================================

function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) {
    return null;
  }
}

function safeReadFile(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8').trim();
  } catch (e) {
    return null;
  }
}

function parseNumber(str) {
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// ============================================
// 硬件层监控
// ============================================

/**
 * 获取 CPU 信息
 */
function getCPUInfo() {
  const cpuInfo = {
    model: 'Unknown',
    cores: 0,
    threads: 0,
    frequency: { current: 0, min: 0, max: 0 },
    temperature: { core: [], package: null },
    load: { load1: 0, load5: 0, load15: 0 },
    usage: 0
  };

  // CPU 模型和核心数
  const cpuinfo = safeReadFile('/proc/cpuinfo');
  if (cpuinfo) {
    const lines = cpuinfo.split('\n');
    lines.forEach(line => {
      if (line.startsWith('model name')) {
        cpuInfo.model = line.split(':')[1].trim();
      }
      if (line.startsWith('processor')) {
        cpuInfo.threads++;
      }
      if (line.startsWith('cpu cores')) {
        cpuInfo.cores = parseInt(line.split(':')[1].trim());
      }
    });
  }

  if (cpuInfo.cores === 0) cpuInfo.cores = cpuInfo.threads;

  // 频率
  const freqInfo = safeReadFile('/proc/cpuinfo');
  if (freqInfo) {
    const lines = freqInfo.split('\n');
    lines.forEach(line => {
      if (line.startsWith('cpu MHz')) {
        const freq = parseFloat(line.split(':')[1].trim());
        if (cpuInfo.frequency.current === 0 || freq > cpuInfo.frequency.current) {
          cpuInfo.frequency.current = freq;
        }
      }
    });
  }

  // 频率范围
  const minFreq = safeReadFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_min_freq');
  const maxFreq = safeReadFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq');
  if (minFreq) cpuInfo.frequency.min = parseInt(minFreq) / 1000;
  if (maxFreq) cpuInfo.frequency.max = parseInt(maxFreq) / 1000;

  // 温度（需要 sensors 命令）
  const sensorsOutput = safeExec('sensors -j 2>/dev/null');
  if (sensorsOutput) {
    try {
      const sensors = JSON.parse(sensorsOutput);
      // 尝试找到核心温度
      for (const chip in sensors) {
        if (chip.includes('coretemp') || chip.includes('cpu')) {
          for (const key in sensors[chip]) {
            if (key.includes('Core') || key.includes('Package')) {
              for (const subKey in sensors[chip][key]) {
                if (subKey.includes('_input')) {
                  const temp = sensors[chip][key][subKey];
                  if (key.includes('Package')) {
                    cpuInfo.temperature.package = temp;
                  } else {
                    cpuInfo.temperature.core.push(temp);
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // 负载
  const loadavg = safeReadFile('/proc/loadavg');
  if (loadavg) {
    const parts = loadavg.split(/\s+/);
    cpuInfo.load.load1 = parseFloat(parts[0]);
    cpuInfo.load.load5 = parseFloat(parts[1]);
    cpuInfo.load.load15 = parseFloat(parts[2]);
  }

  // CPU 使用率（通过 /proc/stat 计算）
  const stat = safeReadFile('/proc/stat');
  if (stat) {
    const line = stat.split('\n')[0];
    const parts = line.split(/\s+/);
    const user = parseInt(parts[1]);
    const nice = parseInt(parts[2]);
    const system = parseInt(parts[3]);
    const idle = parseInt(parts[4]);
    const total = user + nice + system + idle;
    cpuInfo.usage = total > 0 ? Math.round(((user + nice + system) / total) * 100) : 0;
  }

  return cpuInfo;
}

/**
 * 获取内存信息
 */
function getMemoryInfo() {
  const memInfo = {
    total: 0,
    used: 0,
    free: 0,
    available: 0,
    buffers: 0,
    cached: 0,
    swapTotal: 0,
    swapUsed: 0,
    swapFree: 0,
    percent: 0,
    swapPercent: 0
  };

  const meminfo = safeReadFile('/proc/meminfo');
  if (meminfo) {
    const lines = meminfo.split('\n');
    const info = {};
    lines.forEach(line => {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) info[match[1]] = parseInt(match[2]);
    });

    memInfo.total = Math.round((info.MemTotal || 0) / 1024);
    memInfo.free = Math.round((info.MemFree || 0) / 1024);
    memInfo.available = Math.round((info.MemAvailable || memInfo.free) / 1024);
    memInfo.buffers = Math.round((info.Buffers || 0) / 1024);
    memInfo.cached = Math.round((info.Cached || 0) / 1024);
    memInfo.used = memInfo.total - memInfo.available;
    memInfo.percent = memInfo.total > 0 ? Math.round((memInfo.used / memInfo.total) * 100) : 0;

    memInfo.swapTotal = Math.round((info.SwapTotal || 0) / 1024);
    memInfo.swapFree = Math.round((info.SwapFree || 0) / 1024);
    memInfo.swapUsed = memInfo.swapTotal - memInfo.swapFree;
    memInfo.swapPercent = memInfo.swapTotal > 0 ? Math.round((memInfo.swapUsed / memInfo.swapTotal) * 100) : 0;
  }

  return memInfo;
}

/**
 * 获取磁盘信息
 */
function getDiskInfo() {
  const disks = [];
  
  const dfOutput = safeExec('df -h --output=source,size,used,avail,pcent,target 2>/dev/null');
  if (dfOutput) {
    const lines = dfOutput.split('\n').slice(1);
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        const percent = parseInt(parts[4].replace('%', ''));
        disks.push({
          device: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percent: percent,
          mount: parts[5],
          status: percent > 90 ? 'critical' : percent > 80 ? 'warning' : 'normal'
        });
      }
    });
  }

  // 磁盘 IO 统计
  const diskstats = safeReadFile('/proc/diskstats');
  const ioStats = [];
  if (diskstats) {
    const lines = diskstats.split('\n');
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 14) {
        const device = parts[2];
        if (device.startsWith('nvme') || device.startsWith('sd') || device.startsWith('hd')) {
          ioStats.push({
            device: device,
            readsCompleted: parseInt(parts[3]),
            writesCompleted: parseInt(parts[7]),
            readsMerged: parseInt(parts[4]),
            writesMerged: parseInt(parts[8]),
            sectorsRead: parseInt(parts[5]),
            sectorsWritten: parseInt(parts[9])
          });
        }
      }
    });
  }

  return { disks, ioStats };
}

/**
 * 获取电池信息（笔记本）
 */
function getBatteryInfo() {
  const batteries = [];
  const batteryPath = '/sys/class/power_supply';
  
  try {
    const entries = fs.readdirSync(batteryPath);
    entries.forEach(entry => {
      const basePath = path.join(batteryPath, entry);
      const type = safeReadFile(path.join(basePath, 'type'));
      
      if (type === 'Battery') {
        const capacity = safeReadFile(path.join(basePath, 'capacity'));
        const status = safeReadFile(path.join(basePath, 'status'));
        const energyNow = safeReadFile(path.join(basePath, 'energy_now'));
        const energyFull = safeReadFile(path.join(basePath, 'energy_full'));
        const powerNow = safeReadFile(path.join(basePath, 'power_now'));
        
        batteries.push({
          name: entry,
          capacity: capacity ? parseInt(capacity) : 0,
          status: status || 'Unknown',
          energyNow: energyNow ? parseInt(energyNow) / 1000000 : 0, // Wh
          energyFull: energyFull ? parseInt(energyFull) / 1000000 : 0,
          powerNow: powerNow ? parseInt(powerNow) / 1000000 : 0 // W
        });
      }
    });
  } catch (e) {}

  return batteries;
}

// ============================================
// 网络层监控
// ============================================

/**
 * 获取网络接口信息
 */
function getNetworkInterfaces() {
  const interfaces = [];
  const netDev = safeReadFile('/proc/net/dev');
  
  if (netDev) {
    const lines = netDev.split('\n').slice(2);
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 17) {
        const name = parts[0].replace(':', '');
        if (name !== 'lo') {
          interfaces.push({
            name: name,
            rxBytes: parseInt(parts[1]),
            rxPackets: parseInt(parts[2]),
            rxErrors: parseInt(parts[3]),
            rxDropped: parseInt(parts[4]),
            txBytes: parseInt(parts[9]),
            txPackets: parseInt(parts[10]),
            txErrors: parseInt(parts[11]),
            txDropped: parseInt(parts[12])
          });
        }
      }
    });
  }

  // 获取 IP 地址
  const ipOutput = safeExec('ip -j addr 2>/dev/null');
  if (ipOutput) {
    try {
      const ipInfo = JSON.parse(ipOutput);
      ipInfo.forEach(iface => {
        const existing = interfaces.find(i => i.name === iface.ifname);
        if (existing) {
          existing.operstate = iface.operstate;
          existing.mtu = iface.mtu;
          existing.addresses = (iface.addr_info || [])
            .filter(a => a.family === 'inet' || a.family === 'inet6')
            .map(a => ({
              family: a.family,
              address: a.local,
              prefixlen: a.prefixlen
            }));
        }
      });
    } catch (e) {}
  }

  return interfaces;
}

/**
 * 获取网络连接统计
 */
function getNetworkConnections() {
  const connections = {
    tcp: { established: 0, synSent: 0, timeWait: 0, listen: 0, close: 0 },
    udp: { established: 0, listen: 0 },
    total: 0
  };

  // TCP 连接统计
  const tcp = safeReadFile('/proc/net/tcp');
  if (tcp) {
    const lines = tcp.split('\n').slice(1);
    connections.tcp.total = lines.length;
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const state = parseInt(parts[3], 16);
        // TCP 状态码: 1=ESTABLISHED, 2=SYN_SENT, 3=SYN_RECV, 4=FIN_WAIT1, 
        // 5=FIN_WAIT2, 6=TIME_WAIT, 7=CLOSE, 8=CLOSE_WAIT, 9=LAST_ACK, 
        // 10=LISTEN, 11=CLOSING
        switch (state) {
          case 1: connections.tcp.established++; break;
          case 2: connections.tcp.synSent++; break;
          case 6: connections.tcp.timeWait++; break;
          case 10: connections.tcp.listen++; break;
          case 7: connections.tcp.close++; break;
        }
      }
    });
  }

  // UDP 连接统计
  const udp = safeReadFile('/proc/net/udp');
  if (udp) {
    const lines = udp.split('\n').slice(1);
    connections.udp.total = lines.length;
  }

  connections.total = connections.tcp.total + connections.udp.total;

  return connections;
}

/**
 * 网络延迟测试
 */
async function getNetworkLatency() {
  const results = [];
  const hosts = [
    { name: 'localhost', host: '127.0.0.1' },
    { name: '网关', host: getGateway() },
    { name: 'DNS (114)', host: '114.114.114.114' },
    { name: 'DNS (Google)', host: '8.8.8.8' }
  ].filter(h => h.host);

  for (const target of hosts) {
    const result = { name: target.name, host: target.host, latency: null, status: 'timeout' };
    
    try {
      const output = safeExec(`ping -c 1 -W 2 ${target.host} 2>/dev/null`);
      if (output) {
        const match = output.match(/time=([\d.]+)\s*ms/);
        if (match) {
          result.latency = parseFloat(match[1]);
          result.status = 'ok';
        }
      }
    } catch (e) {}
    
    results.push(result);
  }

  return results;
}

/**
 * 获取默认网关
 */
function getGateway() {
  const output = safeExec('ip route | grep default');
  if (output) {
    const match = output.match(/via\s+([\d.]+)/);
    if (match) return match[1];
  }
  return null;
}

// ============================================
// 服务层监控
// ============================================

/**
 * 获取系统服务状态
 */
function getSystemServices() {
  const services = [];
  
  // 检查关键服务
  const serviceList = [
    'openclaw-gateway',
    'nginx',
    'docker',
    'ssh',
    'cron',
    'systemd-resolved'
  ];

  serviceList.forEach(service => {
    const status = safeExec(`systemctl is-active ${service} 2>/dev/null`);
    const enabled = safeExec(`systemctl is-enabled ${service} 2>/dev/null`);
    
    services.push({
      name: service,
      status: status === 'active' ? 'running' : status || 'not-found',
      enabled: enabled === 'enabled',
      type: 'systemd'
    });
  });

  return services;
}

/**
 * 获取进程监控
 */
function getProcessMonitor() {
  const processes = [];
  
  const output = safeExec('ps aux --sort=-%mem | head -20');
  if (output) {
    const lines = output.split('\n').slice(1);
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          user: parts[0],
          pid: parseInt(parts[1]),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          vsz: parts[4],
          rss: parts[5],
          stat: parts[7],
          start: parts[8],
          time: parts[9],
          command: parts.slice(10).join(' ').substring(0, 50)
        });
      }
    });
  }

  return processes;
}

/**
 * 获取端口监听
 */
function getListeningPorts() {
  const ports = [];
  
  const output = safeExec('ss -tuln 2>/dev/null');
  if (output) {
    const lines = output.split('\n').slice(1);
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const addrPort = parts[3];
        const lastColon = addrPort.lastIndexOf(':');
        const addr = addrPort.substring(0, lastColon);
        const port = addrPort.substring(lastColon + 1);
        
        if (!ports.find(p => p.port === port && p.protocol === parts[0])) {
          ports.push({
            protocol: parts[0],
            port: port,
            address: addr === '*' ? '0.0.0.0' : addr,
            state: parts[1] || 'LISTEN'
          });
        }
      }
    });
  }

  // 排序并取前 20 个
  return ports.sort((a, b) => parseInt(a.port) - parseInt(b.port)).slice(0, 20);
}

/**
 * 获取 Docker 容器状态
 */
function getDockerContainers() {
  const containers = [];
  
  const output = safeExec('docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}" 2>/dev/null');
  if (output) {
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const parts = line.split('|');
        containers.push({
          name: parts[0],
          status: parts[1],
          ports: parts[2] || '',
          running: parts[1].includes('Up')
        });
      }
    });
  }

  return containers;
}

// ============================================
// 系统概览
// ============================================

/**
 * 获取系统运行时间
 */
function getUptime() {
  const uptime = safeReadFile('/proc/uptime');
  if (uptime) {
    const seconds = parseFloat(uptime.split(' ')[0]);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return {
      totalSeconds: seconds,
      days,
      hours,
      minutes,
      formatted: `${days}天 ${hours}时 ${minutes}分`,
      bootTime: new Date(Date.now() - seconds * 1000).toISOString()
    };
  }
  return null;
}

/**
 * 获取系统信息
 */
function getSystemInfo() {
  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  
  // 获取发行版信息
  let distro = 'Unknown';
  const osRelease = safeReadFile('/etc/os-release');
  if (osRelease) {
    const match = osRelease.match(/^PRETTY_NAME="(.+)"/m);
    if (match) distro = match[1];
  }

  return {
    hostname,
    platform,
    release,
    arch,
    distro,
    kernel: release
  };
}

// ============================================
// API 路由
// ============================================

/**
 * GET /api/system/overview
 * 系统总览（所有监控数据）
 */
router.get('/overview', async (req, res) => {
  try {
    const [
      cpuInfo,
      memInfo,
      diskInfo,
      batteryInfo,
      networkInterfaces,
      networkConnections,
      services,
      processes,
      ports,
      dockerContainers,
      uptime,
      systemInfo
    ] = await Promise.all([
      Promise.resolve(getCPUInfo()),
      Promise.resolve(getMemoryInfo()),
      Promise.resolve(getDiskInfo()),
      Promise.resolve(getBatteryInfo()),
      Promise.resolve(getNetworkInterfaces()),
      Promise.resolve(getNetworkConnections()),
      Promise.resolve(getSystemServices()),
      Promise.resolve(getProcessMonitor()),
      Promise.resolve(getListeningPorts()),
      Promise.resolve(getDockerContainers()),
      Promise.resolve(getUptime()),
      Promise.resolve(getSystemInfo())
    ]);

    // 计算健康状态
    const health = calculateHealth(cpuInfo, memInfo, diskInfo, services);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      health,
      system: systemInfo,
      uptime,
      hardware: {
        cpu: cpuInfo,
        memory: memInfo,
        disk: diskInfo,
        battery: batteryInfo
      },
      network: {
        interfaces: networkInterfaces,
        connections: networkConnections,
        latency: [] // 需要异步获取，单独接口
      },
      services: {
        system: services,
        processes,
        ports,
        docker: dockerContainers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/system/hardware
 * 硬件层监控
 */
router.get('/hardware', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    cpu: getCPUInfo(),
    memory: getMemoryInfo(),
    disk: getDiskInfo(),
    battery: getBatteryInfo()
  });
});

/**
 * GET /api/system/network
 * 网络层监控
 */
router.get('/network', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    interfaces: getNetworkInterfaces(),
    connections: getNetworkConnections()
  });
});

/**
 * GET /api/system/network/latency
 * 网络延迟测试
 */
router.get('/network/latency', async (req, res) => {
  const latency = await getNetworkLatency();
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    latency
  });
});

/**
 * GET /api/system/services
 * 服务层监控
 */
router.get('/services', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    system: getSystemServices(),
    processes: getProcessMonitor(),
    ports: getListeningPorts(),
    docker: getDockerContainers()
  });
});

/**
 * GET /api/system/health
 * 系统健康检查
 */
router.get('/health', (req, res) => {
  const cpuInfo = getCPUInfo();
  const memInfo = getMemoryInfo();
  const diskInfo = getDiskInfo();
  const services = getSystemServices();

  const health = calculateHealth(cpuInfo, memInfo, diskInfo, services);

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...health
  });
});

/**
 * 计算健康状态
 */
function calculateHealth(cpuInfo, memInfo, diskInfo, services) {
  const issues = [];
  let status = 'healthy';

  // CPU 检查
  if (cpuInfo.load.load1 > cpuInfo.cores) {
    issues.push({ level: 'critical', type: 'cpu', message: 'CPU 负载过高' });
    status = 'critical';
  } else if (cpuInfo.load.load1 > cpuInfo.cores * 0.7) {
    issues.push({ level: 'warning', type: 'cpu', message: 'CPU 负载较高' });
    if (status !== 'critical') status = 'warning';
  }

  // 内存检查
  if (memInfo.percent > 90) {
    issues.push({ level: 'critical', type: 'memory', message: '内存使用率过高' });
    status = 'critical';
  } else if (memInfo.percent > 80) {
    issues.push({ level: 'warning', type: 'memory', message: '内存使用率较高' });
    if (status !== 'critical') status = 'warning';
  }

  // 磁盘检查
  diskInfo.disks.forEach(disk => {
    if (disk.percent > 90) {
      issues.push({ level: 'critical', type: 'disk', message: `磁盘 ${disk.mount} 空间不足` });
      status = 'critical';
    } else if (disk.percent > 80) {
      issues.push({ level: 'warning', type: 'disk', message: `磁盘 ${disk.mount} 空间较少` });
      if (status !== 'critical') status = 'warning';
    }
  });

  // 服务检查
  services.forEach(service => {
    if (service.status !== 'running' && service.enabled) {
      issues.push({ level: 'warning', type: 'service', message: `服务 ${service.name} 未运行` });
      if (status !== 'critical') status = 'warning';
    }
  });

  return {
    status,
    issues,
    score: issues.length === 0 ? 100 : issues.filter(i => i.level === 'critical').length > 0 ? 50 : 80
  };
}

/**
 * GET /api/system/quick
 * 快速状态检查
 */
router.get('/quick', (req, res) => {
  const cpuLoad = getCPUInfo().load.load1;
  const memPercent = getMemoryInfo().percent;
  const mainDisk = getDiskInfo().disks.find(d => d.mount === '/') || { percent: 0 };

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    status: cpuLoad < 2 && memPercent < 80 && mainDisk.percent < 80 ? 'ok' : 'warning',
    cpu: cpuLoad.toFixed(2),
    memory: memPercent,
    disk: mainDisk.percent
  });
});

module.exports = router;