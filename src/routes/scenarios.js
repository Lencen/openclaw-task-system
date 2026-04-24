/**
 * Scenarios API - 场景管理
 * 
 * 功能：
 * 1. 场景 CRUD
 * 2. 场景任务管理
 * 3. 场景数据统计
 * 
 * @version 1.0.0
 * @created 2026-03-19
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const SCENARIOS_FILE = path.join(__dirname, '../data/scenarios.json');

// 辅助函数：读取场景数据
function readScenarios() {
  try {
    if (!fs.existsSync(SCENARIOS_FILE)) {
      return { scenarios: [] };
    }
    const data = fs.readFileSync(SCENARIOS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[Scenarios] 读取失败:', e.message);
    return { scenarios: [] };
  }
}

// 辅助函数：写入场景数据
function writeScenarios(data) {
  try {
    fs.writeFileSync(SCENARIOS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Scenarios] 写入失败:', e.message);
    return false;
  }
}

// 获取所有场景
router.get('/', (req, res) => {
  try {
    const data = readScenarios();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取单个场景
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = readScenarios();
    const scenario = data.scenarios.find(s => s.id === id);
    
    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: '场景不存在'
      });
    }
    
    res.json({ success: true, data: scenario });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 创建场景
router.post('/', (req, res) => {
  try {
    const { title, description, product_id, tasks = [] } = req.body;
    
    const data = readScenarios();
    
    const scenario = {
      id: `scenario-${Date.now()}`,
      title,
      description,
      product_id,
      tasks,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    data.scenarios.push(scenario);
    writeScenarios(data);
    
    res.json({ success: true, data: scenario });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 更新场景
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, product_id, tasks } = req.body;
    
    const data = readScenarios();
    const index = data.scenarios.findIndex(s => s.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: '场景不存在'
      });
    }
    
    data.scenarios[index].title = title || data.scenarios[index].title;
    data.scenarios[index].description = description || data.scenarios[index].description;
    data.scenarios[index].product_id = product_id || data.scenarios[index].product_id;
    data.scenarios[index].tasks = tasks || data.scenarios[index].tasks;
    data.scenarios[index].updated_at = new Date().toISOString();
    
    writeScenarios(data);
    
    res.json({ success: true, data: data.scenarios[index] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 删除场景
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = readScenarios();
    
    const index = data.scenarios.findIndex(s => s.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: '场景不存在'
      });
    }
    
    data.scenarios.splice(index, 1);
    writeScenarios(data);
    
    res.json({ success: true, message: '场景已删除' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取场景任务
router.get('/:id/tasks', (req, res) => {
  try {
    const { id } = req.params;
    const data = readScenarios();
    const scenario = data.scenarios.find(s => s.id === id);
    
    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: '场景不存在'
      });
    }
    
    res.json({ success: true, data: scenario.tasks || [] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
