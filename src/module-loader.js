/**
 * 模块加载器 - 任务管理平台 V3
 * 
 * 功能：
 * 1. 模块注册与管理
 * 2. 依赖解析
 * 3. 循环依赖检测
 * 4. 生命周期钩子
 * 
 * @version 1.0.0
 * @created 2026-03-19
 */

const path = require('path');
const fs = require('fs');

/**
 * 模块接口规范
 * 
 * 每个模块需要实现以下接口：
 * {
 *   name: string,           // 模块名称（唯一）
 *   version: string,        // 模块版本
 *   dependencies: string[], // 依赖模块列表
 *   priority: number,       // 加载优先级（越小越先加载）
 *   init: Function,         // 初始化函数
 *   destroy: Function,      // 销毁函数
 *   config: Object          // 模块配置
 * }
 */

class ModuleLoader {
  constructor(options = {}) {
    this.modules = new Map();         // 已注册模块
    this.loadedModules = new Set();   // 已加载模块
    this.loadingModules = new Set();  // 正在加载的模块（用于检测循环依赖）
    this.config = {
      modulesDir: options.modulesDir || path.join(__dirname, '../modules'),
      autoLoad: options.autoLoad !== false,
      ...options
    };
    this.hooks = {
      beforeLoad: [],
      afterLoad: [],
      beforeInit: [],
      afterInit: [],
      onError: []
    };
  }

  /**
   * 注册模块
   * @param {Object} moduleInfo 模块信息
   * @returns {boolean} 注册是否成功
   */
  register(moduleInfo) {
    // 验证模块接口
    const validation = this.validateModule(moduleInfo);
    if (!validation.valid) {
      this.triggerHook('onError', { module: moduleInfo.name, error: validation.error });
      return false;
    }

    // 检查是否已注册
    if (this.modules.has(moduleInfo.name)) {
      console.warn(`[ModuleLoader] 模块 ${moduleInfo.name} 已注册，将被覆盖`);
    }

    // 注册模块
    this.modules.set(moduleInfo.name, {
      ...moduleInfo,
      status: 'registered',
      registeredAt: new Date().toISOString()
    });

    console.log(`[ModuleLoader] 模块 ${moduleInfo.name}@${moduleInfo.version} 注册成功`);
    return true;
  }

  /**
   * 批量注册模块
   * @param {Object[]} modules 模块列表
   * @returns {Object} 注册结果
   */
  registerAll(modules) {
    const results = { success: 0, failed: 0, errors: [] };

    for (const moduleInfo of modules) {
      if (this.register(moduleInfo)) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(moduleInfo.name);
      }
    }

    return results;
  }

  /**
   * 验证模块接口
   * @param {Object} moduleInfo 模块信息
   * @returns {Object} 验证结果
   */
  validateModule(moduleInfo) {
    if (!moduleInfo || typeof moduleInfo !== 'object') {
      return { valid: false, error: '模块信息必须是对象' };
    }

    if (!moduleInfo.name || typeof moduleInfo.name !== 'string') {
      return { valid: false, error: '模块名称(name)必须是非空字符串' };
    }

    if (!moduleInfo.version || typeof moduleInfo.version !== 'string') {
      return { valid: false, error: '模块版本(version)必须是非空字符串' };
    }

    if (moduleInfo.dependencies && !Array.isArray(moduleInfo.dependencies)) {
      return { valid: false, error: '依赖列表(dependencies)必须是数组' };
    }

    if (moduleInfo.init && typeof moduleInfo.init !== 'function') {
      return { valid: false, error: '初始化函数(init)必须是函数' };
    }

    if (moduleInfo.destroy && typeof moduleInfo.destroy !== 'function') {
      return { valid: false, error: '销毁函数(destroy)必须是函数' };
    }

    return { valid: true };
  }

  /**
   * 解析依赖顺序
   * @param {string} moduleName 模块名称
   * @param {Set} visited 已访问模块
   * @param {Set} stack 当前路径
   * @returns {string[]} 加载顺序
   */
  resolveDependencies(moduleName, visited = new Set(), stack = new Set()) {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`模块 ${moduleName} 未注册`);
    }

    // 检测循环依赖
    if (stack.has(moduleName)) {
      throw new Error(`检测到循环依赖: ${[...stack, moduleName].join(' -> ')}`);
    }

    // 已解析过
    if (visited.has(moduleName)) {
      return [];
    }

    stack.add(moduleName);
    const order = [];

    // 先解析依赖
    if (module.dependencies && module.dependencies.length > 0) {
      for (const dep of module.dependencies) {
        const depOrder = this.resolveDependencies(dep, visited, stack);
        order.push(...depOrder);
      }
    }

    // 再添加自己
    order.push(moduleName);
    visited.add(moduleName);
    stack.delete(moduleName);

    return order;
  }

  /**
   * 检测所有模块的循环依赖
   * @returns {Object} 检测结果
   */
  detectCircularDependencies() {
    const cycles = [];

    for (const [name] of this.modules) {
      try {
        this.resolveDependencies(name);
      } catch (error) {
        if (error.message.includes('循环依赖')) {
          cycles.push(error.message);
        }
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycles: [...new Set(cycles)]
    };
  }

  /**
   * 加载模块
   * @param {string} moduleName 模块名称
   * @returns {Promise<Object>} 加载结果
   */
  async load(moduleName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`模块 ${moduleName} 未注册`);
    }

    // 已加载
    if (this.loadedModules.has(moduleName)) {
      return { success: true, module, cached: true };
    }

    // 正在加载（检测循环依赖）
    if (this.loadingModules.has(moduleName)) {
      throw new Error(`检测到循环加载: ${moduleName}`);
    }

    this.loadingModules.add(moduleName);

    try {
      // 触发 beforeLoad 钩子
      await this.triggerHook('beforeLoad', { module });

      // 先加载依赖
      if (module.dependencies && module.dependencies.length > 0) {
        for (const dep of module.dependencies) {
          if (!this.loadedModules.has(dep)) {
            await this.load(dep);
          }
        }
      }

      // 触发 beforeInit 钩子
      await this.triggerHook('beforeInit', { module });

      // 执行初始化
      if (module.init) {
        await module.init(module.config || {});
      }

      // 更新状态
      module.status = 'loaded';
      module.loadedAt = new Date().toISOString();
      this.loadedModules.add(moduleName);

      // 触发 afterInit 钩子
      await this.triggerHook('afterInit', { module });

      // 触发 afterLoad 钩子
      await this.triggerHook('afterLoad', { module });

      console.log(`[ModuleLoader] 模块 ${moduleName} 加载成功`);
      return { success: true, module };

    } catch (error) {
      module.status = 'error';
      module.error = error.message;

      // 触发错误钩子
      await this.triggerHook('onError', { module, error });

      throw error;

    } finally {
      this.loadingModules.delete(moduleName);
    }
  }

  /**
   * 加载所有模块
   * @returns {Promise<Object>} 加载结果
   */
  async loadAll() {
    const results = { success: 0, failed: 0, errors: [], order: [] };

    // 按优先级排序
    const sortedModules = [...this.modules.entries()]
      .sort((a, b) => (a[1].priority || 100) - (b[1].priority || 100));

    // 检测循环依赖
    const circularCheck = this.detectCircularDependencies();
    if (circularCheck.hasCycles) {
      results.errors.push(...circularCheck.cycles);
      return results;
    }

    // 逐个加载
    for (const [name] of sortedModules) {
      try {
        await this.load(name);
        results.success++;
        results.order.push(name);
      } catch (error) {
        results.failed++;
        results.errors.push({ module: name, error: error.message });
      }
    }

    return results;
  }

  /**
   * 卸载模块
   * @param {string} moduleName 模块名称
   * @returns {Promise<boolean>} 卸载结果
   */
  async unload(moduleName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      return false;
    }

    if (!this.loadedModules.has(moduleName)) {
      return true;
    }

    try {
      // 执行销毁函数
      if (module.destroy) {
        await module.destroy();
      }

      module.status = 'unloaded';
      this.loadedModules.delete(moduleName);

      console.log(`[ModuleLoader] 模块 ${moduleName} 已卸载`);
      return true;

    } catch (error) {
      console.error(`[ModuleLoader] 模块 ${moduleName} 卸载失败:`, error.message);
      return false;
    }
  }

  /**
   * 获取模块
   * @param {string} moduleName 模块名称
   * @returns {Object|null} 模块信息
   */
  getModule(moduleName) {
    return this.modules.get(moduleName) || null;
  }

  /**
   * 获取所有已加载模块
   * @returns {Object[]} 模块列表
   */
  getLoadedModules() {
    return [...this.loadedModules].map(name => this.modules.get(name));
  }

  /**
   * 注册钩子
   * @param {string} hookName 钩子名称
   * @param {Function} callback 回调函数
   */
  on(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(callback);
    }
  }

  /**
   * 触发钩子
   * @param {string} hookName 钩子名称
   * @param {Object} data 数据
   */
  async triggerHook(hookName, data) {
    const callbacks = this.hooks[hookName] || [];
    for (const callback of callbacks) {
      try {
        await callback(data);
      } catch (error) {
        console.error(`[ModuleLoader] 钩子 ${hookName} 执行失败:`, error.message);
      }
    }
  }

  /**
   * 从目录自动加载模块
   * @returns {Promise<Object>} 加载结果
   */
  async autoLoadFromDir() {
    const modulesDir = this.config.modulesDir;

    if (!fs.existsSync(modulesDir)) {
      console.warn(`[ModuleLoader] 模块目录不存在: ${modulesDir}`);
      return { success: 0, failed: 0, errors: [] };
    }

    const results = { success: 0, failed: 0, errors: [] };
    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const modulePath = path.join(modulesDir, entry.name);
      const indexPath = path.join(modulePath, 'index.js');

      if (!fs.existsSync(indexPath)) {
        results.failed++;
        results.errors.push({ module: entry.name, error: '缺少 index.js' });
        continue;
      }

      try {
        const moduleInfo = require(indexPath);
        if (this.register(moduleInfo)) {
          results.success++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ module: entry.name, error: error.message });
      }
    }

    // 自动加载
    if (this.config.autoLoad) {
      await this.loadAll();
    }

    return results;
  }

  /**
   * 获取模块加载器状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      total: this.modules.size,
      loaded: this.loadedModules.size,
      modules: [...this.modules.entries()].map(([name, info]) => ({
        name,
        version: info.version,
        status: info.status,
        dependencies: info.dependencies || []
      }))
    };
  }
}

// 创建全局实例
const moduleLoader = new ModuleLoader();

module.exports = {
  ModuleLoader,
  moduleLoader
};