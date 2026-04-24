/**
 * 客户管理后台 API 路由
 * 
 * @version 1.0
 * @date 2026-03-20
 */

const express = require('express');
const router = express.Router();
const { 
  CustomerService, 
  LicenseService, 
  ActivationService, 
  StatsService 
} = require('../modules/customer-admin-db');

// ============================================
// 客户管理 API
// ============================================

/**
 * GET /api/customers
 * 获取客户列表
 */
router.get('/customers', (req, res) => {
  try {
    const { page, pageSize, status, keyword } = req.query;
    const result = CustomerService.list({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      status,
      keyword
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/customers/:id
 * 获取客户详情
 */
router.get('/customers/:id', (req, res) => {
  try {
    const customer = CustomerService.getById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/customers
 * 创建客户
 */
router.post('/customers', (req, res) => {
  try {
    const data = {
      ...req.body,
      operator: req.user?.id || 'system',
      ipAddress: req.ip
    };
    const customer = CustomerService.create(data);
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/customers/:id
 * 更新客户
 */
router.put('/customers/:id', (req, res) => {
  try {
    const data = {
      ...req.body,
      operator: req.user?.id || 'system',
      ipAddress: req.ip
    };
    const customer = CustomerService.update(req.params.id, data);
    if (!customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }
    res.json({ success: true, data: customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/customers/:id
 * 删除客户
 */
router.delete('/customers/:id', (req, res) => {
  try {
    const result = CustomerService.delete(
      req.params.id,
      req.user?.id || 'system',
      req.ip
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/customers/:id/licenses
 * 获取客户的许可证列表
 */
router.get('/customers/:id/licenses', (req, res) => {
  try {
    const licenses = CustomerService.getLicenses(req.params.id);
    res.json({ success: true, data: licenses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 许可证管理 API
// ============================================

/**
 * GET /api/licenses
 * 获取许可证列表
 */
router.get('/licenses', (req, res) => {
  try {
    const { page, pageSize, status, customerId, keyword } = req.query;
    const result = LicenseService.list({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      status,
      customerId,
      keyword
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/licenses/:id
 * 获取许可证详情
 */
router.get('/licenses/:id', (req, res) => {
  try {
    const license = LicenseService.getById(req.params.id);
    if (!license) {
      return res.status(404).json({ success: false, error: '许可证不存在' });
    }
    res.json({ success: true, data: license });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/licenses
 * 创建许可证
 */
router.post('/licenses', (req, res) => {
  try {
    const data = {
      ...req.body,
      operator: req.user?.id || 'system',
      ipAddress: req.ip
    };
    const license = LicenseService.create(data);
    res.status(201).json({ success: true, data: license });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/licenses/:id/renew
 * 续期许可证
 */
router.post('/licenses/:id/renew', (req, res) => {
  try {
    const { end_date } = req.body;
    if (!end_date) {
      return res.status(400).json({ success: false, error: '缺少 end_date 参数' });
    }
    
    const license = LicenseService.renew(
      req.params.id,
      end_date,
      req.user?.id || 'system',
      req.ip
    );
    res.json({ success: true, data: license });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/licenses/:id/revoke
 * 作废许可证
 */
router.post('/licenses/:id/revoke', (req, res) => {
  try {
    const { reason } = req.body;
    const license = LicenseService.revoke(
      req.params.id,
      reason,
      req.user?.id || 'system',
      req.ip
    );
    res.json({ success: true, data: license });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/licenses/:id/activations
 * 获取许可证的激活记录
 */
router.get('/licenses/:id/activations', (req, res) => {
  try {
    const activations = LicenseService.getActivations(req.params.id);
    res.json({ success: true, data: activations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/licenses/expiring/:days
 * 获取即将到期的许可证
 */
router.get('/licenses/expiring/:days', (req, res) => {
  try {
    const days = parseInt(req.params.days) || 30;
    const licenses = LicenseService.getExpiringSoon(days);
    res.json({ success: true, data: licenses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 激活记录 API
// ============================================

/**
 * GET /api/activations
 * 获取激活记录列表
 */
router.get('/activations', (req, res) => {
  try {
    const { page, pageSize, licenseId, status, machineId } = req.query;
    const result = ActivationService.list({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      licenseId,
      status,
      machineId
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activations/stats
 * 激活统计 (放在 :id 之前，避免路由冲突)
 */
router.get('/activations/stats', (req, res) => {
  try {
    const stats = ActivationService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/activations/:id
 * 获取激活详情
 */
router.get('/activations/:id', (req, res) => {
  try {
    const activation = ActivationService.getById(req.params.id);
    if (!activation) {
      return res.status(404).json({ success: false, error: '激活记录不存在' });
    }
    res.json({ success: true, data: activation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activations/activate
 * 激活许可证
 */
router.post('/activations/activate', (req, res) => {
  try {
    const data = {
      ...req.body,
      operator: req.user?.id || 'system'
    };
    const result = ActivationService.activate(data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activations/:id/deactivate
 * 解绑设备
 */
router.post('/activations/:id/deactivate', (req, res) => {
  try {
    const result = ActivationService.deactivate(
      req.params.id,
      req.user?.id || 'system',
      req.ip
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/activations/heartbeat
 * 心跳更新
 */
router.post('/activations/heartbeat', (req, res) => {
  try {
    const { machine_id } = req.body;
    if (!machine_id) {
      return res.status(400).json({ success: false, error: '缺少 machine_id 参数' });
    }
    const result = ActivationService.heartbeat(machine_id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 统计报表 API
// ============================================

/**
 * GET /api/stats/overview
 * 总览统计
 */
router.get('/stats/overview', (req, res) => {
  try {
    const stats = StatsService.getOverview();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stats/by-product
 * 按产品统计
 */
router.get('/stats/by-product', (req, res) => {
  try {
    const stats = StatsService.byProduct();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stats/by-edition
 * 按版本统计
 */
router.get('/stats/by-edition', (req, res) => {
  try {
    const stats = StatsService.byEdition();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stats/recent-activations
 * 最近激活
 */
router.get('/stats/recent-activations', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activations = StatsService.recentActivations(limit);
    res.json({ success: true, data: activations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;