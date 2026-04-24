/**
 * 系统监控组件 - War Room v3 集成
 * 
 * 监控 CPU、内存、服务状态
 */

const pslist = require('ps-list');
const os = require('os');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
    cpuCheckInterval: 5000, // CPU 检查间隔 (ms)
    memoryCheckInterval: 3000, // 内存检查间隔 (ms)
    processCheckInterval: 10000, // 进程检查间隔 (ms)
    cpuWarningThreshold: 70, // CPU 告警阈值 (%)
    cpuCriticalThreshold: 90, // CPU 严重告警阈值 (%)
    memoryWarningThreshold: 70, // 内存告警阈值 (%)
    memoryCriticalThreshold: 90, // 内存严重告警阈值 (%)
    logRetentionDays: 7 // 日志保留天数
};

/**
 * 全局配置
 */
let config = { ...DEFAULT_CONFIG };

/**
 * 监控状态
 */
let monitorState = {
    cpuUsage: 0,
    memoryUsage: 0,
    memoryTotal: os.totalmem() / (1024 * 1024), // MB
    memoryFree: os.freemem() / (1024 * 1024), // MB
    loadAverage: os.loadavg(),
    uptime: os.uptime(),
    processes: [],
    lastUpdate: Date.now(),
    events: []
};

/**
 * 获取 CPU 使用率
 */
async function getCpuUsage() {
    try {
        const cpus = os.cpus();
        let userTime = 0;
        let SystemTime = 0;
        let idleTime = 0;
        
        for (const cpu of cpus) {
            for (const type of ['user', 'system', 'idle']) {
                const time = cpu.times[type];
                if (type === 'user') userTime += time;
                else if (type === 'system') SystemTime += time;
                else if (type === 'idle') idleTime += time;
            }
        }
        
        const totalTime = userTime + SystemTime + idleTime;
        const usagePercent = totalTime > 0 ? ((totalTime - idleTime) / totalTime) * 100 : 0;
        
        return Math.min(usagePercent, 100).toFixed(1);
    } catch (error) {
        return '0.0';
    }
}

/**
 * 获取内存使用情况
 */
function getMemoryUsage() {
    const total = os.totalmem() / (1024 * 1024); // MB
    const free = os.freemem() / (1024 * 1024); // MB
    const used = total - free;
    const usagePercent = (used / total) * 100;
    
    return {
        total: Math.round(total),
        used: Math.round(used),
        free: Math.round(free),
        usagePercent: Math.round(usagePercent)
    };
}

/**
 * 获取进程列表
 */
async function getProcessList() {
    try {
        const processes = await pslist();
        return processes.slice(0, 50); // 仅返回前 50 个
    } catch (error) {
        return [];
    }
}

/**
 * 获取系统信息
 */
async function getSystemInfo() {
    const cpuUsage = await getCpuUsage();
    const memoryUsage = getMemoryUsage();
    const processes = await getProcessList();
    const loadAverage = os.loadavg();
    
    return {
        cpu: {
            usage: parseFloat(cpuUsage),
            cores: os.cpus().length,
            model: os.cpus()[0].model
        },
        memory: memoryUsage,
        loadAverage: {
            one: loadAverage[0].toFixed(2),
            five: loadAverage[1].toFixed(2),
            fifteen: loadAverage[2].toFixed(2)
        },
        uptime: Math.round(os.uptime()),
        processes: processes.slice(0, 10).map(p => ({
            pid: p.pid,
            name: p.name,
            cpu: (p.cpu || 0).toFixed(1),
            memory: Math.round((p.memory || 0) / 1024)
        })),
        timestamp: new Date().toISOString()
    };
}

/**
 * 检查健康状态
 */
async function checkHealth() {
    const info = await getSystemInfo();
    const events = [];
    
    // CPU 检查
    if (info.cpu.usage >= config.cpuCriticalThreshold) {
        events.push({
            type: 'critical',
            category: 'cpu',
            message: `CPU usage critical: ${info.cpu.usage}%`,
            timestamp: new Date().toISOString()
        });
    } else if (info.cpu.usage >= config.cpuWarningThreshold) {
        events.push({
            type: 'warning',
            category: 'cpu',
            message: `CPU usage warning: ${info.cpu.usage}%`,
            timestamp: new Date().toISOString()
        });
    }
    
    // 内存检查
    if (info.memory.usagePercent >= config.memoryCriticalThreshold) {
        events.push({
            type: 'critical',
            category: 'memory',
            message: `Memory usage critical: ${info.memory.usagePercent}%`,
            timestamp: new Date().toISOString()
        });
    } else if (info.memory.usagePercent >= config.memoryWarningThreshold) {
        events.push({
            type: 'warning',
            category: 'memory',
            message: `Memory usage warning: ${info.memory.usagePercent}%`,
            timestamp: new Date().toISOString()
        });
    }
    
    // 负载检查
    if (info.loadAverage.fifteen > info.cpu.cores * 2) {
        events.push({
            type: 'warning',
            category: 'load',
            message: `Load average too high: ${info.loadAverage.fifteen}`,
            timestamp: new Date().toISOString()
        });
    }
    
    return {
        info,
        health: events.length === 0 ? 'healthy' : (events.some(e => e.type === 'critical') ? 'critical' : 'warning'),
        events
    };
}

/**
 * 获取监控状态
 */
async function getMonitorState() {
    await updateMonitorState();
    return monitorState;
}

/**
 * 更新监控状态
 */
async function updateMonitorState() {
    const info = await getSystemInfo();
    
    monitorState.cpuUsage = info.cpu.usage;
    monitorState.memoryUsage = info.memory.usagePercent;
    monitorState.memoryTotal = info.memory.total;
    monitorState.memoryFree = info.memory.free;
    monitorState.loadAverage = [
        parseFloat(info.loadAverage.one),
        parseFloat(info.loadAverage.five),
        parseFloat(info.loadAverage.fifteen)
    ];
    monitorState.uptime = info.uptime;
    monitorState.processes = info.processes;
    monitorState.lastUpdate = Date.now();
    
    // 添加到事件历史
    if (monitorState.events.length > 100) {
        monitorState.events = monitorState.events.slice(-100);
    }
}

/**
 * 启动监控
 */
async function startMonitor() {
    if (monitorState.monitorInterval) {
        return; // 已经在运行
    }
    
    // 间隔更新
    monitorState.monitorInterval = setInterval(async () => {
        await updateMonitorState();
        
        // 每分钟检查健康状态
        if (monitorState.lastHealthCheck < Date.now() - 60000) {
            const health = await checkHealth();
            monitorState.events.push(...health.events);
            monitorState.lastHealthCheck = Date.now();
        }
    }, config.memoryCheckInterval);
    
    // 立即更新一次
    await updateMonitorState();
    monitorState.lastHealthCheck = Date.now();
    
    return monitorState.monitorInterval;
}

/**
 * 停止监控
 */
function stopMonitor() {
    if (monitorState.monitorInterval) {
        clearInterval(monitorState.monitorInterval);
        monitorState.monitorInterval = null;
    }
}

/**
 * 注册 HTTP 端点
 */
function registerEndpoints(app) {
    // 系统信息
    app.get('/api/monitor/system', async (req, res) => {
        try {
            const info = getSystemInfo();
            res.json({ success: true, data: info });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // 健康状态
    app.get('/api/monitor/health', async (req, res) => {
        try {
            const health = checkHealth();
            res.json({ success: true, data: health });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // 监控状态
    app.get('/api/monitor/state', async (req, res) => {
        try {
            const state = getMonitorState();
            res.json({ success: true, data: state });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // 监控事件历史
    app.get('/api/monitor/events', (req, res) => {
        try {
            const events = monitorState.events.slice(-50);
            res.json({ success: true, data: events });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}

/**
 * 导出 API
 */
module.exports = {
    // 配置
    config,
    
    // 监控 API
    getSystemInfo,
    getMemoryUsage,
    getCpuUsage,
    checkHealth,
    getMonitorState,
    
    // 管理
    startMonitor,
    stopMonitor,
    updateMonitorState,
    
    // HTTP 端点
    registerEndpoints,
    
    // 状态
    monitorState
};
