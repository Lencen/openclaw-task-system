/**
 * 许可证验证 Express 中间件
 * 
 * 提供请求级别的许可证验证
 */

const { LicenseVerifier, defaultVerifier } = require('./license-verify');

/**
 * 创建许可证验证中间件
 * @param {Object} options - 配置选项
 * @returns {Function} Express 中间件函数
 */
function createLicenseVerifyMiddleware(options = {}) {
  const verifier = options.verifier || defaultVerifier;
  const mode = options.mode || 'strict'; // 'strict' | 'quick' | 'optional'
  const licenseKey = options.licenseKey || process.env.LICENSE_KEY;

  return async (req, res, next) => {
    try {
      // 从请求头或查询参数获取许可证密钥
      const key = req.headers['x-license-key'] || 
                  req.query.licenseKey || 
                  licenseKey;

      if (!key && mode === 'strict') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'LICENSE_REQUIRED',
            message: '缺少许可证密钥'
          }
        });
      }

      if (!key && mode === 'optional') {
        // 可选模式，无许可证也继续
        req.license = { valid: false, skipped: true };
        return next();
      }

      // 验证许可证
      let result;
      if (mode === 'quick') {
        result = await verifier.verifyQuick(key);
      } else {
        result = await verifier.verify(key);
      }

      if (!result.valid) {
        return res.status(403).json({
          success: false,
          error: {
            code: result.code || 'INVALID_LICENSE',
            message: result.reason,
            details: {
              expiredAt: result.expiredAt,
              status: result.status,
              deviceId: result.deviceId
            }
          }
        });
      }

      // 将验证结果附加到请求对象
      req.license = result;
      
      // 添加警告头（如果即将过期）
      if (result.details?.warning) {
        res.setHeader('X-License-Warning', result.details.warning);
        res.setHeader('X-License-Days-Remaining', result.details.daysRemaining);
      }

      next();
    } catch (error) {
      console.error('许可证验证错误:', error);
      
      if (mode === 'strict') {
        return res.status(500).json({
          success: false,
          error: {
            code: 'VERIFICATION_ERROR',
            message: '许可证验证失败'
          }
        });
      }
      
      // 非严格模式，允许继续
      req.license = { valid: false, error: error.message };
      next();
    }
  };
}

/**
 * 快速验证中间件（仅验证有效期和状态）
 */
function createQuickVerifyMiddleware(options = {}) {
  return createLicenseVerifyMiddleware({
    ...options,
    mode: 'quick'
  });
}

/**
 * 可选验证中间件（无许可证也允许通过）
 */
function createOptionalVerifyMiddleware(options = {}) {
  return createLicenseVerifyMiddleware({
    ...options,
    mode: 'optional'
  });
}

/**
 * 许可证信息中间件（仅添加信息，不阻止请求）
 */
function createLicenseInfoMiddleware(options = {}) {
  const verifier = options.verifier || defaultVerifier;

  return async (req, res, next) => {
    try {
      const key = req.headers['x-license-key'] || 
                  req.query.licenseKey || 
                  process.env.LICENSE_KEY;

      if (key) {
        const result = await verifier.verifyQuick(key);
        req.license = result;
        
        if (result.warning) {
          res.setHeader('X-License-Warning', result.warning);
        }
      } else {
        req.license = { valid: false, present: false };
      }

      next();
    } catch (error) {
      req.license = { valid: false, error: error.message };
      next();
    }
  };
}

// 预配置的中间件实例
const strictVerify = createLicenseVerifyMiddleware({ mode: 'strict' });
const quickVerify = createQuickVerifyMiddleware();
const optionalVerify = createOptionalVerifyMiddleware();
const licenseInfo = createLicenseInfoMiddleware();

module.exports = {
  createLicenseVerifyMiddleware,
  createQuickVerifyMiddleware,
  createOptionalVerifyMiddleware,
  createLicenseInfoMiddleware,
  strictVerify,
  quickVerify,
  optionalVerify,
  licenseInfo
};