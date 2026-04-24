/**
 * 许可证约束检查模块
 * 实现年度迁移上限、迁移间隔、续期次数等约束
 */

const db = require('../database');

/**
 * 检查迁移约束
 * @param {string} licenseKey - 许可证密钥
 * @returns {Promise<Object>} 检查结果
 */
async function checkMigrationConstraints(licenseKey) {
  const constraints = await db.get(
    'SELECT * FROM license_constraints WHERE license_key = ?',
    [licenseKey]
  );
  
  // 新许可证，无约束记录
  if (!constraints) {
    return {
      allowed: true,
      migrations_this_year: 0,
      migrations_remaining: 2,
      next_migration_available_at: null
    };
  }
  
  const now = new Date();
  const yearStart = constraints.year_start_date ? new Date(constraints.year_start_date) : new Date();
  const yearEnd = new Date(yearStart);
  yearEnd.setFullYear(yearEnd.getFullYear() + 1);
  
  // 检查是否需要重置年度计数
  if (now >= yearEnd) {
    await db.run(
      `UPDATE license_constraints 
       SET year_start_date = ?, current_migration_count = 0, updated_at = ?
       WHERE license_key = ?`,
      [now.toISOString(), now.toISOString(), licenseKey]
    );
    
    return {
      allowed: true,
      migrations_this_year: 0,
      migrations_remaining: 2,
      next_migration_available_at: null
    };
  }
  
  // 检查年度迁移上限（2次/年）
  if (constraints.current_migration_count >= constraints.max_migrations_per_year) {
    return {
      allowed: false,
      reason: `已达到年度迁移上限（${constraints.max_migrations_per_year}次/年）`,
      migrations_this_year: constraints.current_migration_count,
      migrations_remaining: 0,
      next_migration_available_at: yearEnd.toISOString()
    };
  }
  
  // 检查迁移间隔（30天）
  if (constraints.last_migration_at) {
    const lastMigration = new Date(constraints.last_migration_at);
    const minIntervalMs = constraints.min_migration_interval_days * 24 * 60 * 60 * 1000;
    const nextAvailable = new Date(lastMigration.getTime() + minIntervalMs);
    
    if (now < nextAvailable) {
      const daysRemaining = Math.ceil((nextAvailable - now) / (24 * 60 * 60 * 1000));
      return {
        allowed: false,
        reason: `迁移间隔不足${constraints.min_migration_interval_days}天，还需等待${daysRemaining}天`,
        migrations_this_year: constraints.current_migration_count,
        migrations_remaining: constraints.max_migrations_per_year - constraints.current_migration_count,
        next_migration_available_at: nextAvailable.toISOString()
      };
    }
  }
  
  return {
    allowed: true,
    migrations_this_year: constraints.current_migration_count,
    migrations_remaining: constraints.max_migrations_per_year - constraints.current_migration_count,
    next_migration_available_at: null
  };
}

/**
 * 检查续期约束
 * @param {string} licenseKey - 许可证密钥
 * @param {string} licenseType - 许可证类型 (trial/standard/professional/enterprise)
 * @returns {Promise<Object>} 检查结果
 */
async function checkRenewalConstraints(licenseKey, licenseType) {
  // 正式版许可证无需续期
  if (licenseType !== 'trial') {
    return {
      allowed: false,
      reason: '正式版许可证无需续期，如需扩容请购买升级',
      suggestion: '联系 sales@task-platform.com 购买升级'
    };
  }
  
  const constraints = await db.get(
    'SELECT * FROM license_constraints WHERE license_key = ?',
    [licenseKey]
  );
  
  // 无约束记录，允许续期
  if (!constraints) {
    return {
      allowed: true,
      renewals_used: 0,
      renewals_remaining: 2,
      max_duration_days: 30
    };
  }
  
  // 检查续期次数上限（2次）
  if (constraints.current_renewal_count >= constraints.max_renewals) {
    return {
      allowed: false,
      reason: `已达到最大续期次数（${constraints.max_renewals}次）`,
      renewals_used: constraints.current_renewal_count,
      renewals_remaining: 0,
      suggestion: '请购买正式版许可证'
    };
  }
  
  return {
    allowed: true,
    renewals_used: constraints.current_renewal_count,
    renewals_remaining: constraints.max_renewals - constraints.current_renewal_count,
    max_duration_days: 30
  };
}

/**
 * 记录迁移
 * @param {string} licenseKey - 许可证密钥
 * @returns {Promise<void>}
 */
async function recordMigration(licenseKey) {
  const now = new Date().toISOString();
  
  const constraints = await db.get(
    'SELECT * FROM license_constraints WHERE license_key = ?',
    [licenseKey]
  );
  
  if (constraints) {
    await db.run(
      `UPDATE license_constraints 
       SET current_migration_count = current_migration_count + 1,
           last_migration_at = ?,
           updated_at = ?
       WHERE license_key = ?`,
      [now, now, licenseKey]
    );
  } else {
    await db.run(
      `INSERT INTO license_constraints 
       (license_key, max_migrations_per_year, min_migration_interval_days, max_renewals,
        current_migration_count, current_renewal_count, last_migration_at, year_start_date, updated_at)
       VALUES (?, 2, 30, 2, 1, 0, ?, ?, ?)`,
      [licenseKey, now, now, now]
    );
  }
}

/**
 * 记录续期
 * @param {string} licenseKey - 许可证密钥
 * @returns {Promise<void>}
 */
async function recordRenewal(licenseKey) {
  const now = new Date().toISOString();
  
  const constraints = await db.get(
    'SELECT * FROM license_constraints WHERE license_key = ?',
    [licenseKey]
  );
  
  if (constraints) {
    await db.run(
      `UPDATE license_constraints 
       SET current_renewal_count = current_renewal_count + 1,
           last_renewal_at = ?,
           updated_at = ?
       WHERE license_key = ?`,
      [now, now, licenseKey]
    );
  } else {
    await db.run(
      `INSERT INTO license_constraints 
       (license_key, max_migrations_per_year, min_migration_interval_days, max_renewals,
        current_migration_count, current_renewal_count, last_renewal_at, year_start_date, updated_at)
       VALUES (?, 2, 30, 2, 0, 1, ?, ?, ?)`,
      [licenseKey, now, now, now]
    );
  }
}

/**
 * 获取约束信息
 * @param {string} licenseKey - 许可证密钥
 * @returns {Promise<Object>} 约束信息
 */
async function getConstraints(licenseKey) {
  const constraints = await db.get(
    'SELECT * FROM license_constraints WHERE license_key = ?',
    [licenseKey]
  );
  
  if (!constraints) {
    return {
      max_migrations_per_year: 2,
      min_migration_interval_days: 30,
      max_renewals: 2,
      current_migration_count: 0,
      current_renewal_count: 0,
      last_migration_at: null,
      last_renewal_at: null,
      year_start_date: new Date().toISOString()
    };
  }
  
  return constraints;
}

module.exports = {
  checkMigrationConstraints,
  checkRenewalConstraints,
  recordMigration,
  recordRenewal,
  getConstraints
};