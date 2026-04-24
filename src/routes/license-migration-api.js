/**
 * 许可证迁移 API
 * 实现迁移申请、完成、取消、查询等功能
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  checkMigrationConstraints,
  recordMigration
} = require('../middleware/license-constraints');

const db = require('../database/db');

/**
 * 生成机器ID
 */
function generateMachineId() {
  const hostname = require('os').hostname();
  const mac = require('os').networkInterfaces();
  const macAddress = Object.values(mac).flat().find(i => i.mac && i.mac !== '00:00:00:00:00:00')?.mac || '';
  const hash = crypto.createHash('sha256').update(hostname + macAddress).digest('hex');
  return `TP-MACHINE-${hash.substring(0, 8).toUpperCase()}-${hash.substring(8, 16).toUpperCase()}`;
}

/**
 * 生成迁移令牌
 */
function generateMigrationToken(migrationId, machineId) {
  const timestamp = Date.now();
  const data = `${migrationId}:${machineId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', process.env.LICENSE_SECRET || 'default-secret')
    .update(data).digest('hex');
  return `mig_${Buffer.from(`${migrationId}:${timestamp}:${signature}`).toString('base64')}`;
}

/**
 * 验证迁移令牌
 */
function verifyMigrationToken(token, expectedMachineId) {
  try {
    const decoded = Buffer.from(token.replace('mig_', ''), 'base64').toString();
    const [migrationId, timestamp, signature] = decoded.split(':');
    
    // 检查有效期（24小时）
    if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) {
      return { valid: false, reason: '令牌已过期' };
    }
    
    // 验证签名
    const data = `${migrationId}:${expectedMachineId}:${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', process.env.LICENSE_SECRET || 'default-secret')
      .update(data).digest('hex');
    
    if (signature !== expectedSignature) {
      return { valid: false, reason: '令牌签名无效' };
    }
    
    return { valid: true, migrationId };
  } catch (error) {
    return { valid: false, reason: '令牌格式错误' };
  }
}

/**
 * POST /api/license/migration/request
 * 申请迁移
 */
router.post('/request', async (req, res) => {
  try {
    const { license_key, reason, target_machine_id } = req.body;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少许可证密钥'
      });
    }
    
    // 检查约束
    const constraintCheck = await checkMigrationConstraints(license_key);
    if (!constraintCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: constraintCheck.reason,
        data: {
          constraints: constraintCheck
        }
      });
    }
    
    // 获取当前机器ID
    const fromMachineId = generateMachineId();
    
    // 创建迁移记录
    const migrationId = `mig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时有效期
    
    await db.run(
      `INSERT INTO license_migrations 
       (id, license_key, from_machine_id, to_machine_id, migration_type, status, 
        requested_at, expires_at, reason, metadata)
       VALUES (?, ?, ?, ?, 'outbound', 'pending', ?, ?, ?, ?)`,
      [
        migrationId,
        license_key,
        fromMachineId,
        target_machine_id || null,
        new Date().toISOString(),
        expiresAt.toISOString(),
        reason || '',
        JSON.stringify({ ip: req.ip, userAgent: req.headers['user-agent'] })
      ]
    );
    
    // 生成迁移令牌
    const targetId = target_machine_id || fromMachineId;
    const token = generateMigrationToken(migrationId, targetId);
    
    // 更新约束计数
    await recordMigration(license_key);
    
    res.json({
      success: true,
      data: {
        migration_id: migrationId,
        status: 'pending',
        token: token,
        expires_at: expiresAt.toISOString(),
        constraints: constraintCheck
      }
    });
  } catch (error) {
    console.error('申请迁移失败:', error);
    res.status(500).json({
      success: false,
      error: '申请迁移失败: ' + error.message
    });
  }
});

/**
 * POST /api/license/migration/complete
 * 完成迁移
 */
router.post('/complete', async (req, res) => {
  try {
    const { migration_id, machine_id, token } = req.body;
    
    if (!migration_id || !machine_id) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
    }
    
    // 验证令牌
    if (token) {
      const tokenCheck = verifyMigrationToken(token, machine_id);
      if (!tokenCheck.valid) {
        return res.status(403).json({
          success: false,
          error: tokenCheck.reason
        });
      }
    }
    
    // 查询迁移记录
    const migration = await db.get(
      'SELECT * FROM license_migrations WHERE id = ?',
      [migration_id]
    );
    
    if (!migration) {
      return res.status(404).json({
        success: false,
        error: '迁移记录不存在'
      });
    }
    
    if (migration.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `迁移状态为 ${migration.status}，无法完成`
      });
    }
    
    // 检查是否过期
    if (new Date() > new Date(migration.expires_at)) {
      await db.run(
        "UPDATE license_migrations SET status = 'expired', updated_at = ? WHERE id = ?",
        [new Date().toISOString(), migration_id]
      );
      return res.status(400).json({
        success: false,
        error: '迁移令牌已过期'
      });
    }
    
    // 完成迁移
    await db.run(
      `UPDATE license_migrations 
       SET status = 'completed', to_machine_id = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [machine_id, new Date().toISOString(), new Date().toISOString(), migration_id]
    );
    
    // 更新许可证绑定
    await db.run(
      `UPDATE licenses SET machine_id = ?, updated_at = ? WHERE key = ?`,
      [machine_id, new Date().toISOString(), migration.license_key]
    );
    
    res.json({
      success: true,
      data: {
        migration_id: migration_id,
        status: 'completed',
        message: '迁移完成，许可证已绑定到新服务器'
      }
    });
  } catch (error) {
    console.error('完成迁移失败:', error);
    res.status(500).json({
      success: false,
      error: '完成迁移失败: ' + error.message
    });
  }
});

/**
 * POST /api/license/migration/cancel
 * 取消迁移
 */
router.post('/cancel', async (req, res) => {
  try {
    const { migration_id } = req.body;
    
    if (!migration_id) {
      return res.status(400).json({
        success: false,
        error: '缺少迁移ID'
      });
    }
    
    const migration = await db.get(
      'SELECT * FROM license_migrations WHERE id = ?',
      [migration_id]
    );
    
    if (!migration) {
      return res.status(404).json({
        success: false,
        error: '迁移记录不存在'
      });
    }
    
    if (migration.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `迁移状态为 ${migration.status}，无法取消`
      });
    }
    
    await db.run(
      "UPDATE license_migrations SET status = 'cancelled', updated_at = ? WHERE id = ?",
      [new Date().toISOString(), migration_id]
    );
    
    // 回滚约束计数
    await db.run(
      `UPDATE license_constraints 
       SET current_migration_count = MAX(0, current_migration_count - 1)
       WHERE license_key = ?`,
      [migration.license_key]
    );
    
    res.json({
      success: true,
      data: {
        migration_id: migration_id,
        status: 'cancelled'
      }
    });
  } catch (error) {
    console.error('取消迁移失败:', error);
    res.status(500).json({
      success: false,
      error: '取消迁移失败: ' + error.message
    });
  }
});

/**
 * GET /api/license/migrations
 * 查询迁移历史
 */
router.get('/', async (req, res) => {
  try {
    const { license_key, status, limit = 20, offset = 0 } = req.query;
    
    let query = 'SELECT * FROM license_migrations WHERE 1=1';
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
    
    const migrations = await db.all(query, params);
    
    res.json({
      success: true,
      data: {
        migrations: migrations,
        total: migrations.length
      }
    });
  } catch (error) {
    console.error('查询迁移历史失败:', error);
    res.status(500).json({
      success: false,
      error: '查询迁移历史失败：' + error.message
    });
  }
});

/**
 * GET /api/license/migration/constraints
 * 查询迁移约束
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
    
    const constraints = await checkMigrationConstraints(license_key);
    
    res.json({
      success: true,
      data: constraints
    });
  } catch (error) {
    console.error('查询迁移约束失败:', error);
    res.status(500).json({
      success: false,
      error: '查询迁移约束失败：' + error.message
    });
  }
});

module.exports = router;