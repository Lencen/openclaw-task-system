/**
 * 许可证验证 API 路由
 * 
 * 提供许可证验证相关的 REST API
 */

const express = require('express');
const router = express.Router();
const { LicenseVerifier, defaultVerifier } = require('../middleware/license-verify');
const { createLicenseVerifyMiddleware } = require('../middleware/license-verify-middleware');

/**
 * 验证许可证
 * POST /api/license/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const { licenseKey, licenseData } = req.body;
    
    if (!licenseKey && !licenseData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_LICENSE',
          message: '缺少许可证密钥或数据'
        }
      });
    }

    const data = licenseKey || licenseData;
    const result = await defaultVerifier.verify(data);

    res.json({
      success: result.valid,
      data: result.valid ? {
        valid: true,
        license: result.details,
        warning: result.details?.warning || null
      } : {
        valid: false,
        error: result.reason,
        code: result.code
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 快速验证许可证
 * POST /api/license/verify-quick
 */
router.post('/verify-quick', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_LICENSE',
          message: '缺少许可证密钥'
        }
      });
    }

    const result = await defaultVerifier.verifyQuick(licenseKey);

    res.json({
      success: result.valid,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 获取许可证信息
 * GET /api/license/info
 */
router.get('/info', async (req, res) => {
  try {
    const licenseKey = req.headers['x-license-key'] || req.query.licenseKey;
    
    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_LICENSE',
          message: '缺少许可证密钥'
        }
      });
    }

    const result = await defaultVerifier.verify(licenseKey);

    if (!result.valid) {
      return res.status(403).json({
        success: false,
        error: {
          code: result.code || 'INVALID_LICENSE',
          message: result.reason
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: result.license.id,
        version: result.license.version,
        product: result.license.product,
        customer: result.license.customer,
        activation: result.license.activation,
        limits: result.license.limits,
        status: result.license.status || 'active',
        details: result.details
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 检查许可证状态
 * GET /api/license/status
 */
router.get('/status', async (req, res) => {
  try {
    const licenseKey = req.headers['x-license-key'] || req.query.licenseKey;
    
    if (!licenseKey) {
      return res.json({
        success: true,
        data: {
          valid: false,
          present: false,
          message: '无许可证'
        }
      });
    }

    const result = await defaultVerifier.verifyQuick(licenseKey);

    res.json({
      success: true,
      data: {
        valid: result.valid,
        present: true,
        licenseId: result.licenseId,
        warning: result.warning || null,
        daysRemaining: result.daysRemaining || null,
        message: result.valid ? '许可证有效' : result.reason
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_CHECK_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 受保护的路由示例
 * GET /api/license/protected
 */
router.get('/protected', createLicenseVerifyMiddleware({ mode: 'strict' }), (req, res) => {
  res.json({
    success: true,
    message: '访问成功',
    data: {
      license: req.license.details
    }
  });
});

module.exports = router;