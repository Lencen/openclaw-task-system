/**
 * 客户管理后台数据库初始化
 * 
 * 创建客户、许可证、激活记录、审计日志表
 * 
 * @version 1.0
 * @date 2026-03-20
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据目录
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'customer-admin.db');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式
db.pragma('journal_mode = WAL');

console.log(`[CustomerAdminDB] 数据库路径: ${DB_PATH}`);

// ============================================
// 创建表
// ============================================

// 客户表
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    address TEXT,
    type TEXT DEFAULT 'enterprise',
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
  CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
  CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
`);

// 许可证表
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    activation_code TEXT UNIQUE,
    customer_id TEXT NOT NULL,
    
    product_id TEXT NOT NULL,
    product_name TEXT,
    edition TEXT DEFAULT 'professional',
    version TEXT,
    
    features TEXT,
    max_users INTEGER DEFAULT 10,
    max_projects INTEGER DEFAULT 50,
    max_devices INTEGER DEFAULT 1,
    storage_gb INTEGER DEFAULT 10,
    
    validity_type TEXT DEFAULT 'annual',
    start_date DATE,
    end_date DATE,
    trial_days INTEGER,
    
    signature TEXT,
    
    status TEXT DEFAULT 'inactive',
    activated_devices INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    activated_at DATETIME,
    expires_at DATETIME,
    
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
  CREATE INDEX IF NOT EXISTS idx_licenses_code ON licenses(activation_code);
  CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
  CREATE INDEX IF NOT EXISTS idx_licenses_end_date ON licenses(end_date);
`);

// 激活记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS activations (
    id TEXT PRIMARY KEY,
    license_id TEXT NOT NULL,
    license_key TEXT NOT NULL,
    
    machine_id TEXT,
    hostname TEXT,
    ip_address TEXT,
    os_type TEXT,
    os_version TEXT,
    app_version TEXT,
    
    activation_type TEXT DEFAULT 'online',
    status TEXT DEFAULT 'active',
    
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deactivated_at DATETIME,
    last_heartbeat DATETIME,
    
    FOREIGN KEY (license_id) REFERENCES licenses(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
  CREATE INDEX IF NOT EXISTS idx_activations_machine ON activations(machine_id);
  CREATE INDEX IF NOT EXISTS idx_activations_status ON activations(status);
`);

// 审计日志表
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    operator TEXT,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
`);

console.log('[CustomerAdminDB] 数据表创建完成');

// ============================================
// 工具函数
// ============================================

/**
 * 生成唯一 ID
 */
function generateId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}${random}`;
}

/**
 * 记录审计日志
 */
function auditLog(action, entityType, entityId, operator, details, ipAddress) {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, operator, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    action,
    entityType,
    entityId,
    operator || 'system',
    details ? JSON.stringify(details) : null,
    ipAddress
  );
}

// ============================================
// 客户管理
// ============================================

const CustomerService = {
  /**
   * 创建客户
   */
  create(data) {
    const id = generateId('CUST');
    const stmt = db.prepare(`
      INSERT INTO customers (id, name, contact, email, phone, company, address, type, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      data.name,
      data.contact || null,
      data.email || null,
      data.phone || null,
      data.company || null,
      data.address || null,
      data.type || 'enterprise',
      data.status || 'active',
      data.notes || null
    );
    
    auditLog('customer_created', 'customer', id, data.operator, data, data.ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 获取客户详情
   */
  getById(id) {
    const stmt = db.prepare('SELECT * FROM customers WHERE id = ?');
    return stmt.get(id);
  },
  
  /**
   * 获取客户列表
   */
  list(options = {}) {
    const { page = 1, pageSize = 20, status, keyword } = options;
    const offset = (page - 1) * pageSize;
    
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    if (keyword) {
      sql += ' AND (name LIKE ? OR contact LIKE ? OR email LIKE ?)';
      const likeKeyword = `%${keyword}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword);
    }
    
    // 总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countStmt = db.prepare(countSql);
    const { total } = countStmt.get(...params);
    
    // 分页
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    
    const stmt = db.prepare(sql);
    const list = stmt.all(...params);
    
    return { total, page, pageSize, list };
  },
  
  /**
   * 更新客户
   */
  update(id, data) {
    const fields = [];
    const params = [];
    
    ['name', 'contact', 'email', 'phone', 'company', 'address', 'type', 'status', 'notes'].forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    });
    
    if (fields.length === 0) return this.getById(id);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const stmt = db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...params);
    
    auditLog('customer_updated', 'customer', id, data.operator, data, data.ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 删除客户
   */
  delete(id, operator, ipAddress) {
    // 检查是否有关联许可证
    const licenseStmt = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE customer_id = ?');
    const { count } = licenseStmt.get(id);
    
    if (count > 0) {
      throw new Error(`客户有 ${count} 个关联许可证，无法删除`);
    }
    
    const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
    stmt.run(id);
    
    auditLog('customer_deleted', 'customer', id, operator, { deleted: true }, ipAddress);
    
    return { success: true, id };
  },
  
  /**
   * 获取客户的许可证列表
   */
  getLicenses(customerId) {
    const stmt = db.prepare('SELECT * FROM licenses WHERE customer_id = ? ORDER BY created_at DESC');
    return stmt.all(customerId);
  }
};

// ============================================
// 许可证管理
// ============================================

const LicenseService = {
  /**
   * 创建许可证
   */
  create(data) {
    const id = generateId('LIC');
    const licenseKey = data.license_key || generateId('KEY');
    const activationCode = data.activation_code || `LC-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    const stmt = db.prepare(`
      INSERT INTO licenses (
        id, license_key, activation_code, customer_id,
        product_id, product_name, edition, version,
        features, max_users, max_projects, max_devices, storage_gb,
        validity_type, start_date, end_date, trial_days, signature, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      licenseKey,
      activationCode,
      data.customer_id,
      data.product_id,
      data.product_name || 'TaskSystem',
      data.edition || 'professional',
      data.version || '3.0',
      data.features ? JSON.stringify(data.features) : null,
      data.max_users || 10,
      data.max_projects || 50,
      data.max_devices || 1,
      data.storage_gb || 10,
      data.validity_type || 'annual',
      data.start_date || null,
      data.end_date || null,
      data.trial_days || null,
      data.signature || null,
      data.status || 'inactive'
    );
    
    auditLog('license_created', 'license', id, data.operator, data, data.ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 获取许可证详情
   */
  getById(id) {
    const stmt = db.prepare('SELECT * FROM licenses WHERE id = ?');
    const license = stmt.get(id);
    
    if (license && license.features) {
      license.features = JSON.parse(license.features);
    }
    
    return license;
  },
  
  /**
   * 通过激活码获取
   */
  getByActivationCode(code) {
    const stmt = db.prepare('SELECT * FROM licenses WHERE activation_code = ?');
    return stmt.get(code);
  },
  
  /**
   * 获取许可证列表
   */
  list(options = {}) {
    const { page = 1, pageSize = 20, status, customerId, keyword } = options;
    const offset = (page - 1) * pageSize;
    
    let sql = 'SELECT * FROM licenses WHERE 1=1';
    const params = [];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    if (customerId) {
      sql += ' AND customer_id = ?';
      params.push(customerId);
    }
    
    if (keyword) {
      sql += ' AND (license_key LIKE ? OR activation_code LIKE ?)';
      const likeKeyword = `%${keyword}%`;
      params.push(likeKeyword, likeKeyword);
    }
    
    // 总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countStmt = db.prepare(countSql);
    const { total } = countStmt.get(...params);
    
    // 分页
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    
    const stmt = db.prepare(sql);
    const list = stmt.all(...params);
    
    return { total, page, pageSize, list };
  },
  
  /**
   * 更新许可证
   */
  update(id, data) {
    const fields = [];
    const params = [];
    
    const allowedFields = [
      'product_name', 'edition', 'version', 'features',
      'max_users', 'max_projects', 'max_devices', 'storage_gb',
      'start_date', 'end_date', 'status', 'signature'
    ];
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        if (field === 'features') {
          fields.push(`${field} = ?`);
          params.push(JSON.stringify(data[field]));
        } else {
          fields.push(`${field} = ?`);
          params.push(data[field]);
        }
      }
    });
    
    if (fields.length === 0) return this.getById(id);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const stmt = db.prepare(`UPDATE licenses SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...params);
    
    auditLog('license_updated', 'license', id, data.operator, data, data.ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 续期许可证
   */
  renew(id, newEndDate, operator, ipAddress) {
    const license = this.getById(id);
    if (!license) throw new Error('许可证不存在');
    
    const stmt = db.prepare(`
      UPDATE licenses 
      SET end_date = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(newEndDate, id);
    
    auditLog('license_renewed', 'license', id, operator, { 
      oldEndDate: license.end_date, 
      newEndDate 
    }, ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 作废许可证
   */
  revoke(id, reason, operator, ipAddress) {
    const stmt = db.prepare(`
      UPDATE licenses 
      SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    
    auditLog('license_revoked', 'license', id, operator, { reason }, ipAddress);
    
    return this.getById(id);
  },
  
  /**
   * 获取许可证的激活记录
   */
  getActivations(licenseId) {
    const stmt = db.prepare('SELECT * FROM activations WHERE license_id = ? ORDER BY activated_at DESC');
    return stmt.all(licenseId);
  },
  
  /**
   * 获取即将到期的许可证
   */
  getExpiringSoon(days = 30) {
    const stmt = db.prepare(`
      SELECT * FROM licenses 
      WHERE status = 'active' 
        AND end_date IS NOT NULL 
        AND date(end_date) <= date('now', '+' || ? || ' days')
        AND date(end_date) >= date('now')
      ORDER BY end_date ASC
    `);
    return stmt.all(days);
  }
};

// ============================================
// 激活记录管理
// ============================================

const ActivationService = {
  /**
   * 激活许可证
   */
  activate(data) {
    const { license_key, machine_id, hostname, ip_address, os_type, os_version, app_version } = data;
    
    // 查找许可证
    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ? OR activation_code = ?').get(license_key, license_key);
    
    if (!license) {
      throw new Error('许可证不存在');
    }
    
    if (license.status === 'revoked') {
      throw new Error('许可证已被作废');
    }
    
    if (license.status === 'expired') {
      throw new Error('许可证已过期');
    }
    
    // 检查设备数限制
    if (license.activated_devices >= license.max_devices) {
      throw new Error(`已达到最大设备数限制 (${license.max_devices})`);
    }
    
    // 检查是否已激活
    const existing = db.prepare('SELECT * FROM activations WHERE license_id = ? AND machine_id = ? AND status = ?').get(license.id, machine_id, 'active');
    
    if (existing) {
      throw new Error('设备已激活');
    }
    
    // 创建激活记录
    const id = generateId('ACT');
    const stmt = db.prepare(`
      INSERT INTO activations (id, license_id, license_key, machine_id, hostname, ip_address, os_type, os_version, app_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      license.id,
      license.license_key,
      machine_id,
      hostname || null,
      ip_address || null,
      os_type || null,
      os_version || null,
      app_version || null
    );
    
    // 更新许可证状态
    db.prepare(`
      UPDATE licenses 
      SET status = 'active', activated_devices = activated_devices + 1, activated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(license.id);
    
    auditLog('license_activated', 'activation', id, data.operator, data, ip_address);
    
    return {
      success: true,
      activation_id: id,
      license_id: license.id
    };
  },
  
  /**
   * 解绑设备
   */
  deactivate(id, operator, ipAddress) {
    const activation = db.prepare('SELECT * FROM activations WHERE id = ?').get(id);
    
    if (!activation) {
      throw new Error('激活记录不存在');
    }
    
    // 更新激活记录状态
    db.prepare(`
      UPDATE activations 
      SET status = 'deactivated', deactivated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    // 更新许可证设备数
    db.prepare(`
      UPDATE licenses 
      SET activated_devices = MAX(0, activated_devices - 1)
      WHERE id = ?
    `).run(activation.license_id);
    
    auditLog('device_deactivated', 'activation', id, operator, { deactivated: true }, ipAddress);
    
    return { success: true, id };
  },
  
  /**
   * 获取激活记录列表
   */
  list(options = {}) {
    const { page = 1, pageSize = 20, licenseId, status, machineId } = options;
    const offset = (page - 1) * pageSize;
    
    let sql = `
      SELECT a.*, l.customer_id, c.name as customer_name
      FROM activations a
      LEFT JOIN licenses l ON a.license_id = l.id
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (licenseId) {
      sql += ' AND a.license_id = ?';
      params.push(licenseId);
    }
    
    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    
    if (machineId) {
      sql += ' AND a.machine_id LIKE ?';
      params.push(`%${machineId}%`);
    }
    
    // 总数
    const countSql = sql.replace('SELECT a.*, l.customer_id, c.name as customer_name', 'SELECT COUNT(*) as total');
    const countStmt = db.prepare(countSql);
    const { total } = countStmt.get(...params);
    
    // 分页
    sql += ' ORDER BY a.activated_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    
    const stmt = db.prepare(sql);
    const list = stmt.all(...params);
    
    return { total, page, pageSize, list };
  },
  
  /**
   * 获取激活详情
   */
  getById(id) {
    const stmt = db.prepare(`
      SELECT a.*, l.customer_id, l.product_name, c.name as customer_name
      FROM activations a
      LEFT JOIN licenses l ON a.license_id = l.id
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE a.id = ?
    `);
    return stmt.get(id);
  },
  
  /**
   * 心跳更新
   */
  heartbeat(machineId) {
    db.prepare(`
      UPDATE activations 
      SET last_heartbeat = CURRENT_TIMESTAMP
      WHERE machine_id = ? AND status = 'active'
    `).run(machineId);
    
    return { success: true };
  },
  
  /**
   * 获取统计
   */
  getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM activations').get().count;
    const active = db.prepare('SELECT COUNT(*) as count FROM activations WHERE status = ?').get('active').count;
    const deactivated = db.prepare('SELECT COUNT(*) as count FROM activations WHERE status = ?').get('deactivated').count;
    
    return { total, active, deactivated };
  }
};

// ============================================
// 统计服务
// ============================================

const StatsService = {
  /**
   * 总览统计
   */
  getOverview() {
    const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    const activeCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE status = ?').get('active').count;
    
    const licenses = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
    const activeLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = ?').get('active').count;
    const expiredLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = ?').get('expired').count;
    
    const activations = ActivationService.getStats();
    
    const expiringSoon = LicenseService.getExpiringSoon(30).length;
    
    return {
      customers: { total: customers, active: activeCustomers },
      licenses: { total: licenses, active: activeLicenses, expired: expiredLicenses, expiringSoon },
      activations
    };
  },
  
  /**
   * 按产品统计
   */
  byProduct() {
    const stmt = db.prepare(`
      SELECT product_name, COUNT(*) as count
      FROM licenses
      GROUP BY product_name
      ORDER BY count DESC
    `);
    return stmt.all();
  },
  
  /**
   * 按版本统计
   */
  byEdition() {
    const stmt = db.prepare(`
      SELECT edition, COUNT(*) as count
      FROM licenses
      GROUP BY edition
      ORDER BY count DESC
    `);
    return stmt.all();
  },
  
  /**
   * 最近激活
   */
  recentActivations(limit = 10) {
    const stmt = db.prepare(`
      SELECT a.*, c.name as customer_name
      FROM activations a
      LEFT JOIN licenses l ON a.license_id = l.id
      LEFT JOIN customers c ON l.customer_id = c.id
      ORDER BY a.activated_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

// ============================================
// 导出
// ============================================

module.exports = {
  db,
  generateId,
  auditLog,
  CustomerService,
  LicenseService,
  ActivationService,
  StatsService
};