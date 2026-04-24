/**
 * PC 控制 API 路由
 * 
 * 提供 Agent 直接操作 PC 的 API 端点
 */

const express = require('express');
const router = express.Router();
const PCControllerService = require('../services/pc-controller-service');

const pcController = new PCControllerService();

/**
 * 屏幕截图
 * POST /api/pc/screenshot
 */
router.post('/screenshot', async (req, res) => {
  try {
    const result = await pcController.screenshot(req.body);
    res.json({ success: result.success, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 移动鼠标
 * POST /api/pc/mouse/move
 */
router.post('/mouse/move', async (req, res) => {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined) {
      return res.status(400).json({ success: false, error: '缺少 x 或 y 坐标' });
    }
    const result = await pcController.moveMouse(x, y);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 鼠标点击
 * POST /api/pc/mouse/click
 */
router.post('/mouse/click', async (req, res) => {
  try {
    const { x, y, button } = req.body;
    if (x === undefined || y === undefined) {
      return res.status(400).json({ success: false, error: '缺少 x 或 y 坐标' });
    }
    const result = await pcController.click(x, y, button);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 输入文字
 * POST /api/pc/keyboard/type
 */
router.post('/keyboard/type', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: '缺少 text 参数' });
    }
    const result = await pcController.typeText(text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 按键
 * POST /api/pc/keyboard/key
 */
router.post('/keyboard/key', async (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys) {
      return res.status(400).json({ success: false, error: '缺少 keys 参数' });
    }
    const result = await pcController.keyPress(keys);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取屏幕尺寸
 * GET /api/pc/screen/size
 */
router.get('/screen/size', async (req, res) => {
  try {
    const result = await pcController.getScreenSize();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取鼠标位置
 * GET /api/pc/mouse/position
 */
router.get('/mouse/position', async (req, res) => {
  try {
    const result = await pcController.getMousePosition();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行组合动作
 * POST /api/pc/action
 */
router.post('/action', async (req, res) => {
  try {
    const { actions } = req.body;
    if (!Array.isArray(actions)) {
      return res.status(400).json({ success: false, error: 'actions 必须是数组' });
    }

    const results = [];
    for (const action of actions) {
      let result;
      switch (action.type) {
        case 'screenshot':
          result = await pcController.screenshot(action.options);
          break;
        case 'move':
          result = await pcController.moveMouse(action.x, action.y);
          break;
        case 'click':
          result = await pcController.click(action.x, action.y, action.button);
          break;
        case 'type':
          result = await pcController.typeText(action.text);
          break;
        case 'key':
          result = await pcController.keyPress(action.keys);
          break;
        default:
          result = { success: false, error: `未知动作类型: ${action.type}` };
      }
      results.push({ action, result });
    }

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;