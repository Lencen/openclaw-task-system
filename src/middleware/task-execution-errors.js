/**
 * Task Execution Error Codes
 * 
 * 统一错误码定义和错误处理机制
 */

// 错误码常量
const ERROR_CODES = {
    // 通用错误 (1xxx)
    SUCCESS: { code: 200, message: '操作成功' },
    INTERNAL_ERROR: { code: 500, message: '内部服务器错误' },
    INVALID_REQUEST: { code: 400, message: '请求参数无效' },
    NOT_FOUND: { code: 404, message: '资源不存在' },
    CONFLICT: { code: 409, message: '请求冲突' },
    UNAUTHORIZED: { code: 401, message: '未授权' },
    FORBIDDEN: { code: 403, message: '禁止访问' },
    
    // 认证相关错误 (2xxx)
    AUTH_INVALID_TOKEN: { code: 401, message: 'Token 无效或已过期' },
    AUTH_TOKEN_EXPIRED: { code: 401, message: 'Token 已过期' },
    AUTH_PERMISSION_DENIED: { code: 403, message: '权限不足' },
    AUTH_AGENT_NOT_FOUND: { code: 404, message: 'Agent 不存在' },
    
    // 任务相关错误 (3xxx)
    TASK_NOT_FOUND: { code: 404, message: '任务不存在' },
    TASK_INVALID_STATUS: { code: 400, message: '任务状态无效' },
    TASK_ALREADY_COMPLETED: { code: 400, message: '任务已完成，无法继续操作' },
    TASK_CANNOT_CANCEL: { code: 400, message: '任务不能被取消' },
    
    // 步骤相关错误 (4xxx)
    STEP_NOT_FOUND: { code: 400, message: '步骤不存在' },
    STEP_INVALID_INDEX: { code: 400, message: '步骤索引无效' },
    STEP_INVALID_STATUS: { code: 400, message: '步骤状态不允许当前操作' },
    STEP_NOT_RUNNING: { code: 400, message: '步骤未在执行中，无法完成' },
    STEP_NOT_PENDING: { code: 400, message: '步骤未在待处理状态，无法开始' },
    
    // 验证错误 (5xxx)
    VALIDATION_REQUIRED_FIELD: { code: 400, message: '缺少必填字段' },
    VALIDATION_INVALID_FORMAT: { code: 400, message: '字段格式无效' },
    VALIDATION_VALUE_OUT_OF_RANGE: { code: 400, message: '字段值超出范围' },
    VALIDATION_ARRAY_EMPTY: { code: 400, message: '数组不能为空' },
    
    // 分析错误 (6xxx)
    ANALYSIS_REQUIRED_FIELD: { code: 400, message: '分析结果缺少必要字段: thought, conclusion' },
    
    // 拆解错误 (7xxx)
    BREAKDOWN_REQUIRED_FIELD: { code: 400, message: '拆解结果缺少必要字段' },
    BREAKDOWN_INVALID_STEP: { code: 400, message: '步骤格式无效' },
    
    // 系统错误 (8xxx)
    SYSTEM_FILE_ERROR: { code: 500, message: '文件系统错误' },
    SYSTEM_DATABASE_ERROR: { code: 500, message: '数据库错误' },
    SYSTEM_MEMORY_ERROR: { code: 500, message: '内存不足' },
    SYSTEM_TIMEOUT_ERROR: { code: 500, message: '操作超时' }
};

/**
 * 标准化错误响应
 */
function createErrorResponse(errorCode, details = {}) {
    const errorInfo = ERROR_CODES[errorCode] || ERROR_CODES.INTERNAL_ERROR;
    
    return {
        code: errorInfo.code,
        error: {
            type: errorCode,
            message: errorInfo.message,
            timestamp: new Date().toISOString(),
            details
        }
    };
}

/**
 * 验证必填字段
 */
function validateRequiredFields(data, requiredFields) {
    const missingFields = requiredFields.filter(field => {
        if (typeof data[field] === 'undefined' || data[field] === null) {
            return true;
        }
        // 检查空字符串
        if (typeof data[field] === 'string' && data[field].trim() === '') {
            return true;
        }
        return false;
    });
    
    return missingFields;
}

/**
 * 验证步骤索引
 */
function validateStepIndex(task, stepIndex) {
    if (!task.breakdown || !Array.isArray(task.breakdown)) {
        return { valid: false, error: 'TASK_INVALID_STATUS' };
    }
    
    if (stepIndex < 0 || stepIndex >= task.breakdown.length) {
        return { valid: false, error: 'STEP_INVALID_INDEX' };
    }
    
    return { valid: true };
}

/**
 * 检查步骤状态是否允许操作
 */
function validateStepStatus(task, stepIndex, allowedStatuses) {
    const step = task.breakdown[stepIndex];
    if (!step) {
        return { valid: false, error: 'STEP_NOT_FOUND' };
    }
    
    if (!allowedStatuses.includes(step.status)) {
        return { 
            valid: false, 
            error: 'STEP_INVALID_STATUS',
            details: {
                currentStatus: step.status,
                allowedStatuses
            }
        };
    }
    
    return { valid: true };
}

/**
 * 格式化错误堆栈
 */
function formatErrorStack(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
    
    return {
        name: 'UnknownError',
        message: String(error),
        stack: new Error().stack
    };
}

/**
 * 统一错误处理中间件
 */
function errorHandler(error, req, res, next) {
    // 内部错误
    console.error('[ErrorHandler]', error);
    
    // 如果是自定义错误
    if (error.code) {
        return res.status(error.code).json(error);
    }
    
    // 其他错误返回 500
    const response = createErrorResponse('INTERNAL_ERROR');
    res.status(500).json(response);
}

/**
 * 导出 API
 */
module.exports = {
    ERROR_CODES,
    createErrorResponse,
    validateRequiredFields,
    validateStepIndex,
    validateStepStatus,
    formatErrorStack,
    errorHandler
};
