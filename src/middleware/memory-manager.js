/**
 * 内存管理模块 - LRU Cache + 内存监控
 * 
 * 防止内存溢出
 */

const LRU = require('lru-cache');
const fs = require('fs');
const path = require('path');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
    maxMemoryMB: 100, // 最大内存限制 (MB)
    maxCacheSize: 10000, // 缓存最大条数
    cacheTTL: 300000, // 缓存过期时间 (ms)
    warningThreshold: 0.8, // 告警阈值 (80%)
    cleanupInterval: 60000 // 清理检查间隔 (ms)
};

/**
 * 全局配置
 */
let config = { ...DEFAULT_CONFIG };

/**
 * LRU Cache 实例
 */
let lruCache = null;

/**
 * 内存监控状态
 */
let memoryState = {
    currentMB: 0,
    peakMB: 0,
    lastCleanup: Date.now(),
    cleanedItems: 0,
    warnings: []
};

/**
 * 初始化 LRU Cache
 */
function initCache(options = {}) {
    config = { ...config, ...options };
    
    lruCache = new LRU({
        max: config.maxCacheSize,
        ttl: config.cacheTTL,
        sizeCalculation: (value, key) => {
            // 估算每个缓存项的大小
            return JSON.stringify(value).length / 1024; // 转换为 KB
        }
    });
    
    // 启动内存监控
    startMemoryMonitor();
    
    return lruCache;
}

/**
 * 获取当前内存使用量 (MB)
 */
function getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return (usage.heapUsed + usage.external) / (1024 * 1024);
}

/**
 * 获取内存使用百分比
 */
function getMemoryUsagePercent() {
    const current = getCurrentMemoryUsage();
    return current / config.maxMemoryMB;
}

/**
 * 更新内存状态
 */
function updateMemoryState() {
    const currentMB = getCurrentMemoryUsage();
    memoryState.currentMB = currentMB;
    memoryState.peakMB = Math.max(memoryState.peakMB, currentMB);
}

/**
 * 检查内存是否超过限制
 */
function checkMemoryLimit() {
    updateMemoryState();
    
    const usagePercent = getMemoryUsagePercent();
    
    // 检查是否超过限制
    if (usagePercent >= 1.0) {
        const error = new Error(`Memory limit exceeded: ${memoryState.currentMB.toFixed(2)}MB / ${config.maxMemoryMB}MB`);
        memoryState.warnings.push({
            type: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
        return { exceeded: true, error };
    }
    
    // 检查是否接近限制
    if (usagePercent >= config.warningThreshold) {
        memoryState.warnings.push({
            type: 'warning',
            message: `Memory usage high: ${memoryState.currentMB.toFixed(2)}MB (${(usagePercent * 100).toFixed(1)}%)`,
            timestamp: new Date().toISOString()
        });
        return { warning: true, usagePercent };
    }
    
    return { normal: true, usagePercent };
}

/**
 * 清理缓存（释放内存）
 */
function cleanupCache() {
    const initialSize = lruCache.size;
    
    // 清理过期项
    lruCache.forEach((value, key) => {
        // 手动触发 TTL 检查
        // LRU cache 会自动清理过期项
    });
    
    // 如果内存仍然高，清理最近最少使用的项
    const usagePercent = getMemoryUsagePercent();
    if (usagePercent > 0.9) {
        // 清理到 70% 的容量
        const targetSize = Math.floor(config.maxCacheSize * 0.7);
        while (lruCache.size > targetSize) {
            lruCache.dequeue();
        }
    } else if (usagePercent > 0.8) {
        // 清理到 85% 的容量
        const targetSize = Math.floor(config.maxCacheSize * 0.85);
        while (lruCache.size > targetSize) {
            lruCache.dequeue();
        }
    }
    
    const cleanedItems = initialSize - lruCache.size;
    memoryState.cleanedItems += cleanedItems;
    memoryState.lastCleanup = Date.now();
    
    return { cleanedItems, newSize: lruCache.size };
}

/**
 * 启动内存监控
 */
function startMemoryMonitor() {
    // 清理现有的定时器
    if (memoryState.cleanupTimer) {
        clearInterval(memoryState.cleanupTimer);
    }
    
    // 设置新的定时器
    memoryState.cleanupTimer = setInterval(() => {
        const check = checkMemoryLimit();
        
        if (check.exceeded) {
            console.error(`[Memory Monitor] ${check.error.message}`);
            cleanupCache();
        } else if (check.warning) {
            console.warn(`[Memory Monitor] ${check.message}`);
            // 可选：触发告警事件
            emitMemoryWarning(check);
        } else {
            // 定期清理
            if (memoryState.lastCleanup < Date.now() - config.cleanupInterval) {
                cleanupCache();
            }
        }
    }, config.cleanupInterval);
    
    // 设置 immediate 任务
    if (memoryState.immediateTimer) {
        clearTimeout(memoryState.immediateTimer);
    }
    
    memoryState.immediateTimer = setInterval(() => {
        checkMemoryLimit();
    }, 10000); // 每 10 秒检查一次
}

/**
 * 停止内存监控
 */
function stopMemoryMonitor() {
    if (memoryState.cleanupTimer) {
        clearInterval(memoryState.cleanupTimer);
        memoryState.cleanupTimer = null;
    }
    
    if (memoryState.immediateTimer) {
        clearTimeout(memoryState.immediateTimer);
        memoryState.immediateTimer = null;
    }
}

/**
 * 发送内存告警事件
 */
function emitMemoryWarning(usage) {
    // 事件名称
    const eventName = 'memory_warning';
    
    // 事件数据
    const eventData = {
        type: 'memory_warning',
        currentMB: memoryState.currentMB,
        maxMB: config.maxMemoryMB,
        usagePercent: (usage.usagePercent * 100).toFixed(1),
        timestamp: new Date().toISOString(),
        warnings: memoryState.warnings.slice(-10) // 最近 10 条警告
    };
    
    // 可以在这里触发更多操作
    // 例如：发送通知、记录日志等
    console.warn(`[Memory Warning] ${JSON.stringify(eventData)}`);
}

/**
 * 获取内存状态
 */
function getMemoryStatus() {
    updateMemoryState();
    return {
        currentMB: memoryState.currentMB,
        peakMB: memoryState.peakMB,
        maxMB: config.maxMemoryMB,
        usagePercent: (memoryState.currentMB / config.maxMemoryMB * 100).toFixed(1),
        cacheSize: lruCache ? lruCache.size : 0,
        cacheMax: config.maxCacheSize,
        lastCleanup: memoryState.lastCleanup,
        cleanedItems: memoryState.cleanedItems,
        warnings: memoryState.warnings.slice(-10)
    };
}

/**
 * 写入内存状态到文件（便于调试）
 */
function writeMemoryStatusToFile(filePath = 'data/memory-status.json') {
    const status = getMemoryStatus();
    
    try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(status, null, 2));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * LRU Cache 操作封装
 */
const cacheAPI = {
    // 获取缓存
    get: (key) => {
        return lruCache.get(key);
    },
    
    // 设置缓存
    set: (key, value, options = {}) => {
        return lruCache.set(key, value, {
            ttl: options.ttl || config.cacheTTL
        });
    },
    
    // 删除缓存
    delete: (key) => {
        return lruCache.delete(key);
    },
    
    // 清空缓存
    clear: () => {
        return lruCache.clear();
    },
    
    // 检查键是否存在
    has: (key) => {
        return lruCache.has(key);
    },
    
    // 获取缓存大小
    size: () => {
        return lruCache.size;
    }
};

/**
 * 导出 API
 */
module.exports = {
    // 初始化
    init: initCache,
    
    // 缓存 API
    cache: cacheAPI,
    
    // 内存管理
    getCurrentMemoryUsage,
    getMemoryUsagePercent,
    checkMemoryLimit,
    cleanupCache,
    startMemoryMonitor,
    stopMemoryMonitor,
    emitMemoryWarning,
    getMemoryStatus,
    writeMemoryStatusToFile,
    
    // 配置
    config,
    
    // 状态
    memoryState
};
