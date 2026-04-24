/**
 * 许可证验证服务
 * 
 * 功能:
 * - 签名验证 (HMAC-SHA256)
 * - 校验和验证 (SHA-256)
 * - 有效期验证
 * - 状态检查
 * - 设备绑定验证
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class LicenseVerifier {
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.LICENSE_SECRET || 'default-secret-change-in-production';
    this.licenseDir = options.licenseDir || path.join(__dirname, '../license/data');
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 1分钟缓存
  }

  /**
   * 验证许可证
   * @param {Object|string} licenseData - 许可证数据或密钥
   * @returns {Promise<Object>} 验证结果
   */
  async verify(licenseData) {
    // 1. 解析许可证数据
    const license = await this.parseLicense(licenseData);
    if (!license) {
      return { valid: false, reason: '许可证不存在或格式错误', code: 'LICENSE_NOT_FOUND' };
    }

    // 2. 验证签名
    const signatureResult = this.verifySignature(license);
    if (!signatureResult.valid) {
      return signatureResult;
    }

    // 3. 验证校验和
    const checksumResult = this.verifyChecksum(license);
    if (!checksumResult.valid) {
      return checksumResult;
    }

    // 4. 验证有效期
    const expiryResult = this.verifyExpiry(license);
    if (!expiryResult.valid) {
      return expiryResult;
    }

    // 5. 验证状态
    const statusResult = this.verifyStatus(license);
    if (!statusResult.valid) {
      return statusResult;
    }

    // 6. 验证设备绑定
    const deviceResult = await this.verifyDevice(license);
    if (!deviceResult.valid) {
      return deviceResult;
    }

    return {
      valid: true,
      license: license,
      details: {
        id: license.id,
        customer: license.customer?.name,
        expiresAt: license.activation?.expiryDate,
        maxDevices: license.limits?.maxDevices,
        warning: expiryResult.warning || null,
        daysRemaining: expiryResult.daysRemaining || null
      }
    };
  }

  /**
   * 快速验证（仅验证有效期和状态，用于频繁检查）
   * @param {Object|string} licenseData - 许可证数据或密钥
   * @returns {Promise<Object>} 验证结果
   */
  async verifyQuick(licenseData) {
    // 检查缓存
    const cacheKey = typeof licenseData === 'string' ? licenseData : licenseData.id;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    const license = await this.parseLicense(licenseData);
    if (!license) {
      return { valid: false, reason: '许可证不存在', code: 'LICENSE_NOT_FOUND' };
    }

    // 仅验证有效期和状态
    const expiryResult = this.verifyExpiry(license);
    if (!expiryResult.valid) {
      return expiryResult;
    }

    const statusResult = this.verifyStatus(license);
    if (!statusResult.valid) {
      return statusResult;
    }

    const result = {
      valid: true,
      licenseId: license.id,
      warning: expiryResult.warning || null,
      daysRemaining: expiryResult.daysRemaining || null
    };

    // 缓存结果
    this.cache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
  }

  /**
   * 解析许可证数据
   */
  async parseLicense(licenseData) {
    // 如果是密钥字符串，读取文件
    if (typeof licenseData === 'string') {
      // 尝试直接作为文件路径
      if (fs.existsSync(licenseData)) {
        const content = fs.readFileSync(licenseData, 'utf-8');
        return JSON.parse(content);
      }

      // 尝试在许可证目录中查找
      if (fs.existsSync(this.licenseDir)) {
        const files = fs.readdirSync(this.licenseDir);
        const licenseFile = files.find(f => 
          f.includes(licenseData) || f.includes('license-')
        );
        if (licenseFile) {
          const filePath = path.join(this.licenseDir, licenseFile);
          const content = fs.readFileSync(filePath, 'utf-8');
          return JSON.parse(content);
        }
      }
      
      return null;
    }
    
    // 如果是对象，直接返回
    return licenseData;
  }

  /**
   * 验证签名
   */
  verifySignature(license) {
    const { signature, ...dataWithoutSig } = license;
    if (!signature) {
      return { valid: false, reason: '缺少签名', code: 'MISSING_SIGNATURE' };
    }

    // 计算期望的签名
    const dataToSign = JSON.stringify({
      id: dataWithoutSig.id,
      version: dataWithoutSig.version,
      product: dataWithoutSig.product,
      customer: dataWithoutSig.customer,
      activation: dataWithoutSig.activation,
      limits: dataWithoutSig.limits
    });

    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(dataToSign)
      .digest('base64');

    if (signature !== expectedSignature) {
      return { valid: false, reason: '签名验证失败', code: 'INVALID_SIGNATURE' };
    }

    return { valid: true };
  }

  /**
   * 验证校验和
   */
  verifyChecksum(license) {
    const { checksum, signature, ...dataWithoutSec } = license;
    if (!checksum) {
      return { valid: false, reason: '缺少校验和', code: 'MISSING_CHECKSUM' };
    }

    // 计算期望的校验和
    const dataToCheck = JSON.stringify(dataWithoutSec);
    const expectedChecksum = crypto
      .createHash('sha256')
      .update(dataToCheck)
      .digest('hex');

    if (checksum !== expectedChecksum) {
      return { valid: false, reason: '校验和验证失败', code: 'INVALID_CHECKSUM' };
    }

    return { valid: true };
  }

  /**
   * 验证有效期
   */
  verifyExpiry(license) {
    const expiryDate = license.activation?.expiryDate;
    if (!expiryDate) {
      return { valid: false, reason: '许可证无有效期', code: 'MISSING_EXPIRY' };
    }

    const now = new Date();
    const expiry = new Date(expiryDate);

    if (now > expiry) {
      return { 
        valid: false, 
        reason: `许可证已于 ${expiryDate} 到期`, 
        code: 'EXPIRED',
        expiredAt: expiryDate
      };
    }

    // 检查是否即将过期（7天内）
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 7) {
      return {
        valid: true,
        warning: `许可证将在 ${daysRemaining} 天后到期`,
        daysRemaining,
        code: 'EXPIRING_SOON'
      };
    }

    return { valid: true, daysRemaining };
  }

  /**
   * 验证状态
   */
  verifyStatus(license) {
    const status = license.status || 'active';
    
    const validStatuses = ['active', 'pending'];
    if (!validStatuses.includes(status)) {
      return { 
        valid: false, 
        reason: `许可证状态无效: ${status}`, 
        code: 'INVALID_STATUS',
        status
      };
    }

    return { valid: true, status };
  }

  /**
   * 验证设备绑定
   */
  async verifyDevice(license) {
    // 获取设备ID（从环境变量或请求上下文）
    const deviceId = process.env.DEVICE_ID || 'default-device';
    
    // 获取授权设备列表
    const authorizedDevices = license.authorizedDevices || [];
    
    // 如果没有设备限制，允许所有设备
    if (authorizedDevices.length === 0) {
      return { valid: true };
    }

    // 检查当前设备是否在授权列表中
    if (!authorizedDevices.includes(deviceId)) {
      return {
        valid: false,
        reason: '当前设备未授权',
        code: 'UNAUTHORIZED_DEVICE',
        deviceId
      };
    }

    return { valid: true, deviceId };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

// 创建默认实例
const defaultVerifier = new LicenseVerifier();

// 导出类和默认实例
module.exports = {
  LicenseVerifier,
  defaultVerifier,
  verify: (licenseData) => defaultVerifier.verify(licenseData),
  verifyQuick: (licenseData) => defaultVerifier.verifyQuick(licenseData)
};