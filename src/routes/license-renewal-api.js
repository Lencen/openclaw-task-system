/**
 * 许可证续期 API
 * 实现续期申请、审批、查询等功能
 */

const express = require('express');
const router = express.Router();
const {
  checkRenewalConstraints,
  recordRenewal
} = require('../middleware/license-constraints');

const db = require('../database');

/**
 * POST /api/license/renewal/request
 * 申请续期
 */
router.post('/request', async (req, res) => {
  try {
    const { license_key, renewal_type, requested_duration_days, reason } = req.body;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少许可证密钥'
      });
    }
    
    // 检查续期约束（假设试用版）
    const constraintCheck = await checkRenewalConstraints(license_key, 'trial');
    if (!constraintCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: constraintCheck.reason,
        data: {
          constraints: constraintCheck,
          suggestion: constraintCheck.suggestion
        }
      });
    }
    
    // 验证续期类型
    const validTypes = ['trial_extension', 'upgrade', 'expansion'];
    if (!validTypes.includes(renewal_type)) {
      return res.status(400).json({
        success: false,
        error: '无效的续期类型'
      });
    }
    
    // 验证续期时长
    const duration = Math.min(
      requested_duration_days || 15,
      constraintCheck.max_duration_days
    );
    
    // 创建续期记录
    const renewalId = `rnw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    await db.run(
      `INSERT INTO license_renewals 
       (id, license_key, renewal_type, previous_expiry, status, 
        requested_at, reason, metadata)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        renewalId,
        license_key,
        renewal_type,
        null,
        new Date().toISOString(),
        reason || '',
        JSON.stringify({
          requested_duration_days: duration,
          license_type: 'trial',
          ip: req.ip
        })
      ]
    );
    
    res.json({
      success: true,
      data: {
        renewal_id: renewalId,
        status: 'pending',
        constraints: constraintCheck,
        message: '续期申请已提交，等待审批'
      }
    });
  } catch (error) {
    console.error('申请续期失败:', error);
    res.status(500).json({
      success: false,
      error: '申请续期失败: ' + error.message
    });
  }
});

/**
 * POST /api/license/renewal/approve
 * 审批续期（管理员）
 */
router.post('/approve', async (req, res) => {
  try {
    const { renewal_id, approved_duration_days, notes } = req.body;
    const approver = req.headers['x-user-id'] || 'system';
    
    if (!renewal_id) {
      return res.status(400).json({
        success: false,
        error: '缺少续期ID'
      });
    }
    
    const renewal = await db.get(
      'SELECT * FROM license_renewals WHERE id = ?',
      [renewal_id]
    );
    
    if (!renewal) {
      return res.status(404).json({
        success: false,
        error: '续期记录不存在'
      });
    }
    
    if (renewal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `续期状态为 ${renewal.status}，无法审批`
      });
    }
    
    // 计算新的过期时间
    const duration = approved_duration_days || 15;
    const previousExpiry = renewal.previous_expiry ? new Date(renewal.previous_expiry) : new Date();
    const newExpiry = new Date(previousExpiry.getTime() + duration * 24 * 60 * 60 * 1000);
    
    // 更新续期记录
    await db.run(
      `UPDATE license_renewals 
       SET status = 'approved', approved_at = ?, approved_by = ?, 
           new_expiry = ?, metadata = json_patch(metadata, ?)
       WHERE id = ?`,
      [
        new Date().toISOString(),
        approver,
        newExpiry.toISOString(),
        JSON.stringify({ approved_duration_days: duration, notes: notes || '' }),
        renewal_id
      ]
    );
    
    // 记录续期计数
    await recordRenewal(renewal.license_key);
    
    res.json({
      success: true,
      data: {
        renewal_id: renewal_id,
        status: 'approved',
        new_expiry: newExpiry.toISOString(),
        message: `续期已批准，有效期延长${duration}天`
      }
    });
  } catch (error) {
    console.error('审批续期失败:', error);
    res.status(500).json({
      success: false,
      error: '审批续期失败: ' + error.message
    });
  }
});

/**
 * POST /api/license/renewal/reject
 * 拒绝续期（管理员）
 */
router.post('/reject', async (req, res) => {
  try {
    const { renewal_id, reason } = req.body;
    const approver = req.headers['x-user-id'] || 'system';
    
    if (!renewal_id) {
      return res.status(400).json({
        success: false,
        error: '缺少续期ID'
      });
    }
    
    const renewal = await db.get(
      'SELECT * FROM license_renewals WHERE id = ?',
      [renewal_id]
    );
    
    if (!renewal) {
      return res.status(404).json({
        success: false,
        error: '续期记录不存在'
      });
    }
    
    if (renewal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `续期状态为 ${renewal.status}，无法拒绝`
      });
    }
    
    await db.run(
      `UPDATE license_renewals 
       SET status = 'rejected', approved_at = ?, approved_by = ?, reason = ?
       WHERE id = ?`,
      [new Date().toISOString(), approver, reason || '', renewal_id]
    );
    
    res.json({
      success: true,
      data: {
        renewal_id: renewal_id,
        status: 'rejected',
        reason: reason
      }
    });
  } catch (error) {
    console.error('拒绝续期失败:', error);
    res.status(500).json({
      success: false,
      error: '拒绝续期失败: ' + error.message
    });
  }
});

/**
 * GET /api/license/renewals
 * 查询续期历史
 */
router.get('/', async (req, res) => {
  try {
    const { license_key, status, limit = 20, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM license_renewals WHERE 1=1';
    const params = [];
    
    if (license_key) {
      query += ' AND license_key = ?';
      params.push(license_key);
    }
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY requested_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const renewals = await db.all(query, params);
    
    res.json({
      success: true,
      data: {
        renewals: renewals,
        total: renewals.length
      }
    });
  } catch (error) {
    console.error('查询续期历史失败:', error);
    res.status(500).json({
      success: false,
      error: '查询续期历史失败: ' + error.message
    });
  }
});

/**
 * GET /api/license/renewal/constraints
 * 查询续期约束
 */
router.get('/constraints', async (req, res) => {
  try {
    const { license_key } = req.query;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少许可证密钥'
      });
    }
    
    // 简化处理，假设是试用版
    const constraints = await checkRenewalConstraints(license_key, 'trial');
    
    res.json({
      success: true,
      data: constraints
    });
  } catch (error) {
    console.error('查询续期约束失败:', error);
    res.status(500).json({
      success: false,
      error: '查询续期约束失败：' + error.message
    });
  }
});

module.exports = router;