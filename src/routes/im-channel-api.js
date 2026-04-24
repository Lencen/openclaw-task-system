/**
 * IM 渠道路由
 * 提供 IM 渠道管理的 RESTful API
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const { IMChannelFactory } = require('../im-channel');

// 全局 IM 渠道工厂实例
let imFactory = null;

// 初始化 IM 渠道工厂
function getIMFactory() {
  if (!imFactory) {
    imFactory = new IMChannelFactory();
  }
  return imFactory;
}

// 加载渠道配置
function loadChannelConfig() {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const configPath = path.join(__dirname, '../../openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    return config.channels || {};
  } catch (error) {
    console.error('[IMChannelRoutes] 读取配置失败:', error.message);
    return {};
  }
}

// GET /api/im-channel/status - 获取 IM 渠道状态
router.get('/status', async (req, res) => {
  try {
    const imFactory = getIMFactory();
    const channels = imFactory.getChannelManager().getAllChannels();
    
    res.json({
      success: true,
      channels: channels.map(c => ({
        name: c.name,
        initialized: c.initialized
      })),
      providerCount: imFactory.getProviderFactory().getAllProviders().length
    });
  } catch (error) {
    console.error('[IMChannelRoutes] 获取状态失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/im-channel/list - 获取渠道列表
router.get('/list', (req, res) => {
  try {
    const config = loadChannelConfig();
    
    const channels = Object.entries(config).map(([name, cfg]) => ({
      id: name,
      name: cfg.name || name,
      icon: cfg.icon || '💬',
      type: 'IM',
      enabled: cfg.enabled || false,
      connectionMode: cfg.connectionMode || 'websocket',
      defaultAgent: cfg.defaultAgent || 'chat',
      accounts: Object.keys(cfg.accounts || {})
    }));
    
    res.json({
      success: true,
      channels
    });
  } catch (error) {
    console.error('[IMChannelRoutes] 获取列表失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/im-channel/config - 获取渠道配置
router.get('/config/:channel', (req, res) => {
  try {
    const config = loadChannelConfig();
    const channelConfig = config[req.params.channel];
    
    if (!channelConfig) {
      return res.status(404).json({
        success: false,
        error: '渠道配置不存在'
      });
    }
    
    res.json({
      success: true,
      config: channelConfig
    });
  } catch (error) {
    console.error('[IMChannelRoutes] 获取配置失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/im-channel/load - 加载 channels
router.post('/load', async (req, res) => {
  try {
    const imFactory = getIMFactory();
    const config = loadChannelConfig();
    
    // 加载所有 enabled 的 channels
    const enabledChannels = {};
    for (const [name, cfg] of Object.entries(config)) {
      if (cfg.enabled) {
        enabledChannels[name] = cfg;
      }
    }
    
    const results = await imFactory.loadChannels(enabledChannels);
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('[IMChannelRoutes] 加载 channels 失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/im-channel/webhook/:channel - Webhook 入口
router.post('/webhook/:channel', async (req, res) => {
  try {
    const imFactory = getIMFactory();
    
    await imFactory.getChannelManager().handleWebhook(req.params.channel, req, res);
  } catch (error) {
    console.error('[IMChannelRoutes] Webhook 处理失败:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// GET /api/im-channel/providers - 获取 Providers
router.get('/providers', (req, res) => {
  try {
    const imFactory = getIMFactory();
    const providers = imFactory.getProviderFactory().getAllProviders();
    
    res.json({
      success: true,
      providers: providers.map(p => ({
        channel: p.channel,
        hasToken: !!p.provider.tokenManager
      }))
    });
  } catch (error) {
    console.error('[IMChannelRoutes] 获取 Providers 失败:', error.message);
    res.json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
