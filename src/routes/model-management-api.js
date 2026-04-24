const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const router = express.Router();

const OPENCLAW_CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw/openclaw.json');
const MODELS_CONFIG_DIR = path.join(__dirname, '../data/models');

// 确保models配置目录存在
if (!fs.existsSync(MODELS_CONFIG_DIR)) {
  fs.mkdirSync(MODELS_CONFIG_DIR, { recursive: true });
}

const MODELS_CONFIG_FILE = path.join(MODELS_CONFIG_DIR, 'models-config.json');

/**
 * 读取openclaw.json
 */
function readOpenClawConfig() {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_FILE)) {
      return { models: { providers: {} } };
    }
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('[Model API] 读取openclaw.json失败:', error.message);
    return { models: { providers: {} } };
  }
}

/**
 * 保存openclaw.json
 */
function saveOpenClawConfig(config) {
  try {
    fs.writeFileSync(OPENCLAW_CONFIG_FILE, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[Model API] 保存openclaw.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 读取用户自定义的models配置
 */
function readModelsConfig() {
  try {
    if (!fs.existsSync(MODELS_CONFIG_FILE)) {
      return { models: [] };
    }
    return JSON.parse(fs.readFileSync(MODELS_CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('[Model API] 读取models-config.json失败:', error.message);
    return { models: [] };
  }
}

/**
 * 保存用户自定义的models配置
 */
function saveModelsConfig(config) {
  try {
    fs.writeFileSync(MODELS_CONFIG_FILE, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (error) {
    console.error('[Model API] 保存models-config.json失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 获取所有模型（系统预定义 + 用户自定义）
 */
router.get('/models', (req, res) => {
  try {
    const openclawConfig = readOpenClawConfig();
    const customConfig = readModelsConfig();
    
    // 读取测速结果
    const speedResultsPath = path.join(MODELS_CONFIG_DIR, 'speed-results.json');
    let speedResults = { results: {}, lastUpdate: null };
    try {
      if (fs.existsSync(speedResultsPath)) {
        speedResults = JSON.parse(fs.readFileSync(speedResultsPath, 'utf-8'));
      }
    } catch (e) {
      // 忽略读取错误
    }

    // 合并系统模型和自定义模型
    const allModels = [];

    // 添加系统预定义模型
    if (openclawConfig.models && openclawConfig.models.providers) {
      Object.entries(openclawConfig.models.providers).forEach(([providerId, provider]) => {
        if (provider.models) {
          provider.models.forEach(model => {
            const fullId = `${providerId}/${model.id}`;
            const speedData = speedResults.results[fullId] || {};
            allModels.push({
              id: model.id,
              name: model.name,
              provider: providerId,
              providerName: providerId,
              baseUrl: provider.baseUrl,
              api: provider.api,
              auth: provider.auth,
              enabled: true,
              source: 'system',
              contextWindow: model.contextWindow,
              maxTokens: model.maxTokens,
              reasoning: model.reasoning || false,
              // 测速数据
              speed: speedData.speed,
              lastSpeedTest: speedData.lastTest
            });
          });
        }
      });
    }

    // 添加用户自定义模型
    if (customConfig.models) {
      customConfig.models.forEach(model => {
        const speedData = speedResults.results[model.id] || {};
        allModels.push({
          ...model,
          source: 'custom',
          speed: speedData.speed || model.speed,
          lastSpeedTest: speedData.lastTest || model.lastSpeedTest
        });
      });
    }

    res.json({
      success: true,
      models: allModels,
      total: allModels.length,
      systemModels: allModels.filter(m => m.source === 'system').length,
      customModels: allModels.filter(m => m.source === 'custom').length
    });
  } catch (error) {
    console.error('[Model API] 获取模型列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取提供商列表
 */
router.get('/providers', (req, res) => {
  try {
    const openclawConfig = readOpenClawConfig();
    const providers = [];

    if (openclawConfig.models && openclawConfig.models.providers) {
      Object.entries(openclawConfig.models.providers).forEach(([id, provider]) => {
        providers.push({
          id,
          name: id, // 可以从alias映射获取友好的名称
          baseUrl: provider.baseUrl,
          api: provider.api,
          auth: provider.auth || 'api-key',
          enabled: true,
          source: 'system'
        });
      });
    }

    // 添加用户自定义的providers
    const customConfig = readModelsConfig();
    if (customConfig.models) {
      const customProviders = new Map();
      customConfig.models.forEach(model => {
        if (!customProviders.has(model.provider)) {
          customProviders.set(model.provider, {
            id: model.provider,
            name: model.provider,
            baseUrl: model.baseUrl,
            auth: model.auth || 'api-key',
            enabled: model.enabled !== false,
            source: 'custom'
          });
        }
      });
      providers.push(...Array.from(customProviders.values()));
    }

    res.json({
      success: true,
      providers,
      total: providers.length
    });
  } catch (error) {
    console.error('[Model API] 获取提供商列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 测试模型连接
 */
router.post('/test', async (req, res) => {
  const { baseUrl, apiKey, modelName, provider } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({
      success: false,
      error: 'baseUrl和apiKey是必填项'
    });
  }

  try {
    console.log(`[Model API] 测试模型连接: ${provider || '未知'} - ${modelName || '所有模型'}`);

    // 根据provider类型选择测试方法
    if (provider === 'openai' || baseUrl.includes('api.openai.com')) {
      // OpenAI兼容的API
      const testUrl = modelName
        ? `${baseUrl}/v1/chat/completions`
        : `${baseUrl}/v1/models`;

      let response;
      if (modelName) {
        // 测试特定模型
        response = await axios.post(
          testUrl,
          {
            model: modelName,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
      } else {
        // 测试连接并获取模型列表
        response = await axios.get(testUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
      }

      return res.json({
        success: true,
        message: '连接测试成功',
        models: response.data?.data || null
      });
    } else {
      // 通用测试
      const testUrl = `${baseUrl.replace(/\/$/, '')}/v1/models`;
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return res.json({
        success: true,
        message: '连接测试成功',
        models: response.data?.data || null,
        providerType: 'openai-compatible'
      });
    }
  } catch (error) {
    console.error('[Model API] 连接测试失败:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: `API错误 (${error.response.status}): ${error.response.data?.error?.message || error.response.statusText}`
      });
    }

    return res.status(500).json({
      success: false,
      error: `连接失败: ${error.message}`
    });
  }
});

/**
 * 获取某提供商的可用模型列表
 */
router.post('/fetch-models', async (req, res) => {
  const { baseUrl, apiKey, provider } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({
      success: false,
      error: 'baseUrl和apiKey是必填项'
    });
  }

  try {
    console.log(`[Model API] 获取模型列表: ${provider || baseUrl}`);

    // 规范化baseUrl
    let normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    if (!normalizedBaseUrl.endsWith('/v1')) {
      normalizedBaseUrl = `${normalizedBaseUrl}/v1`;
    }

    const testUrl = `${normalizedBaseUrl}/models`;
    const response = await axios.get(testUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const models = response.data?.data || [];

    // 提取模型信息
    const modelList = models.map(m => ({
      id: m.id,
      name: m.id, // OpenAI API通常只返回id
      created: m.created,
      owned_by: m.owned_by || 'unknown'
    }));

    return res.json({
      success: true,
      message: `找到 ${modelList.length} 个模型`,
      models: modelList
    });
  } catch (error) {
    console.error('[Model API] 获取模型列表失败:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: `API错误 (${error.response.status}): ${error.response.data?.error?.message || error.response.statusText}`
      });
    }

    return res.status(500).json({
      success: false,
      error: `获取模型列表失败: ${error.message}`
    });
  }
});

/**
 * 添加自定义模型
 */
router.post('/models', async (req, res) => {
  const { provider, baseUrl, apiKey, modelName, modelId, description = '' } = req.body;

  if (!provider || !baseUrl || !apiKey || !modelName) {
    return res.status(400).json({
      success: false,
      error: ' provider、baseUrl、apiKey、modelName是必填项'
    });
  }

  try {
    // 先测试连接
    console.log(`[Model API] 测试新模型: ${provider}/${modelName}`);
    const testResult = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      {
        model: modelName,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (testResult.status !== 200) {
      throw new Error('连接测试失败');
    }

    // 保存模型配置
    const config = readModelsConfig();

    const newModel = {
      id: modelId || `${provider}/${modelName}`,
      name: modelName,
      provider,
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey,
      description,
      enabled: true,
      source: 'custom',
      createdAt: new Date().toISOString()
    };

    // 检查是否已存在
    if (config.models.some(m => m.id === newModel.id)) {
      return res.status(400).json({
        success: false,
        error: '模型已存在'
      });
    }

    config.models.push(newModel);

    const saved = saveModelsConfig(config);
    if (!saved.success) {
      return res.status(500).json(saved);
    }

    res.status(201).json({
      success: true,
      model: newModel,
      message: '模型添加成功并已通过连接测试'
    });
  } catch (error) {
    console.error('[Model API] 添加模型失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 切换模型启用/禁用状态
 */
router.put('/models/:id/toggle', (req, res) => {
  const { id } = req.params;
  const config = readModelsConfig();

  const modelIndex = config.models.findIndex(m => m.id === id);

  if (modelIndex === -1) {
    return res.status(404).json({
      success: false,
      error: '模型不存在'
    });
  }

  const currentStatus = config.models[modelIndex].enabled;
  config.models[modelIndex].enabled = !currentStatus;

  const saved = saveModelsConfig(config);
  if (!saved.success) {
    return res.status(500).json(saved);
  }

  res.json({
    success: true,
    model: config.models[modelIndex],
    message: `模型已${!currentStatus ? '启用' : '禁用'}`
  });
});

/**
 * 删除自定义模型
 */
router.delete('/models/:id', (req, res) => {
  const { id } = req.params;
  const config = readModelsConfig();

  const modelIndex = config.models.findIndex(m => m.id === id);

  if (modelIndex === -1) {
    return res.status(404).json({
      success: false,
      error: '模型不存在'
    });
  }

  const deletedModel = config.models[modelIndex];

  // 系统预定义模型不能删除
  if (deletedModel.source === 'system') {
    return res.status(403).json({
      success: false,
      error: '系统预定义模型不能删除'
    });
  }

  config.models.splice(modelIndex, 1);

  const saved = saveModelsConfig(config);
  if (!saved.success) {
    return res.status(500).json(saved);
  }

  res.json({
    success: true,
    message: '模型已删除'
  });
});

/**
 * 测试模型响应速度
 */
router.post('/models/speed-test', async (req, res) => {
  const { modelId } = req.body;
  
  if (!modelId) {
    return res.status(400).json({ success: false, error: '缺少模型 ID' });
  }
  
  const startTime = Date.now();
  
  try {
    // 获取模型配置
    const openclawConfig = readOpenClawConfig();
    const customConfig = readModelsConfig();
    
    let modelConfig = null;
    let providerConfig = null;
    
    // 查找模型配置
    if (openclawConfig.models && openclawConfig.models.providers) {
      Object.entries(openclawConfig.models.providers).forEach(([providerId, provider]) => {
        if (provider.models) {
          const model = provider.models.find(m => m.id === modelId || `${providerId}/${m.id}` === modelId);
          if (model) {
            modelConfig = model;
            providerConfig = provider;
          }
        }
      });
    }
    
    // 如果是自定义模型
    const customModel = customConfig.models.find(m => m.id === modelId);
    if (customModel) {
      modelConfig = customModel;
      // 查找自定义 provider
      if (customModel.provider && openclawConfig.models?.providers?.[customModel.provider]) {
        providerConfig = openclawConfig.models.providers[customModel.provider];
      }
    }
    
    if (!modelConfig || !providerConfig) {
      return res.status(404).json({ success: false, error: '模型配置不存在' });
    }
    
    const baseUrl = providerConfig.baseUrl || customModel.baseUrl;
    const apiKey = providerConfig.api?.key || customModel.apiKey;
    
    if (!baseUrl) {
      return res.status(400).json({ success: false, error: '模型缺少 Base URL' });
    }
    
    // 发送测试请求
    const testUrl = `${baseUrl}/chat/completions`;
    const testResponse = await axios.post(testUrl, {
      model: modelConfig.id || modelId.split('/').pop(),
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'test'}`
      },
      timeout: 30000
    });
    
    const endTime = Date.now();
    const speed = endTime - startTime;
    
    // 保存测速结果
    const speedConfig = readModelsConfig();
    const speedModelIndex = speedConfig.models.findIndex(m => m.id === modelId);
    if (speedModelIndex !== -1) {
      speedConfig.models[speedModelIndex].speed = speed;
      speedConfig.models[speedModelIndex].lastSpeedTest = new Date().toISOString();
      saveModelsConfig(speedConfig);
    }
    
    res.json({
      success: true,
      speed,
      modelId
    });
    
  } catch (error) {
    const endTime = Date.now();
    const speed = endTime - startTime;
    
    console.error('[Model API] 测速失败:', error.message);
    
    res.json({
      success: false,
      speed,
      error: error.message,
      modelId
    });
  }
});

/**
 * 批量测速（用于定时任务）
 */
router.post('/models/speed-test-all', async (req, res) => {
  try {
    const openclawConfig = readOpenClawConfig();
    const customConfig = readModelsConfig();
    const results = [];
    
    // 获取所有模型
    const allModels = [];
    
    if (openclawConfig.models && openclawConfig.models.providers) {
      Object.entries(openclawConfig.models.providers).forEach(([providerId, provider]) => {
        if (provider.models) {
          provider.models.forEach(model => {
            allModels.push({
              id: model.id,
              fullId: `${providerId}/${model.id}`,
              provider: providerId,
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey || provider.api?.key // 兼容两种配置格式
            });
          });
        }
      });
    }
    
    customConfig.models.forEach(model => {
      allModels.push({
        id: model.id,
        fullId: model.id,
        provider: model.provider,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey
      });
    });
    
    // 并发测试（限制并发数）
    const BATCH_SIZE = 3;
    for (let i = 0; i < allModels.length; i += BATCH_SIZE) {
      const batch = allModels.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (model) => {
        const startTime = Date.now();
        try {
          if (model.baseUrl && model.apiKey) {
            await axios.post(`${model.baseUrl}/chat/completions`, {
              model: model.id,
              messages: [{ role: 'user', content: 'hi' }],
              max_tokens: 5
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.apiKey}`
              },
              timeout: 10000
            });
          }
          return { id: model.fullId, speed: Date.now() - startTime, success: true };
        } catch (e) {
          return { id: model.fullId, speed: Date.now() - startTime, success: false, error: e.message };
        }
      }));
      results.push(...batchResults);
    }
    
    // 保存测速结果到单独的文件（不影响模型配置）
    const speedResultsPath = path.join(MODELS_CONFIG_DIR, 'speed-results.json');
    let speedResults = { results: {}, lastUpdate: null };
    
    try {
      if (fs.existsSync(speedResultsPath)) {
        speedResults = JSON.parse(fs.readFileSync(speedResultsPath, 'utf-8'));
      }
    } catch (e) {
      // 忽略读取错误
    }
    
    // 更新测速结果
    results.forEach(result => {
      speedResults.results[result.id] = {
        speed: result.speed,
        success: result.success,
        error: result.error || null,
        lastTest: new Date().toISOString()
      };
    });
    speedResults.lastUpdate = new Date().toISOString();
    
    // 保存到文件
    try {
      fs.writeFileSync(speedResultsPath, JSON.stringify(speedResults, null, 2));
    } catch (e) {
      console.error('[Model API] 保存测速结果失败:', e.message);
    }
    
    res.json({
      success: true,
      results,
      total: results.length
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
