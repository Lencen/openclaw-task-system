/**
 * 文件读取 API
 * 用于在前端访问本地文件
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 工作区根目录
const WORKSPACE_ROOT = '/path/to/workspace';

// 允许访问的目录白名单（相对于工作区）
const ALLOWED_DIRS = [
    'memory',
    'docs',
    'docs/projects',
    'output',
    'kb-sync',
    'task-system-v2',
    'task-system-v2/docs',
    'task-system-v2/docs/projects',
    'task-system-v2/data',
    'notes/my-knowledge',
    'knowledge'
];

/**
 * 检查路径是否在白名单中
 */
function isPathAllowed(filePath) {
    // 如果是相对路径，转换为绝对路径
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
        resolvedPath = path.join(WORKSPACE_ROOT, filePath);
    }
    resolvedPath = path.resolve(resolvedPath);
    
    // 检查是否在工作区下
    if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
        return false;
    }
    
    // 获取相对工作区的路径
    const relativePath = path.relative(WORKSPACE_ROOT, resolvedPath);
    
    // 检查是否在允许的目录中
    return ALLOWED_DIRS.some(allowedDir => {
        return relativePath.startsWith(allowedDir) || relativePath.startsWith('/' + allowedDir);
    });
}

/**
 * 解析文件路径（支持相对路径和绝对路径）
 */
function resolveFilePath(filePath) {
    if (path.isAbsolute(filePath)) {
        return path.resolve(filePath);
    }
    return path.resolve(WORKSPACE_ROOT, filePath);
}

/**
 * 获取文件内容
 * GET /api/file/read?path=/path/to/file
 */
router.get('/read', (req, res) => {
    const filePath = req.query.path;
    
    if (!filePath) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'BadRequestError',
                message: '缺少 path 参数'
            }
        });
    }
    
    // 解析路径（支持相对路径）
    const resolvedPath = resolveFilePath(filePath);
    
    // 安全检查：路径必须在白名单中
    if (!isPathAllowed(filePath)) {
        return res.status(403).json({
            code: 403,
            error: {
                type: 'ForbiddenError',
                message: '不允许访问该路径'
            }
        });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '文件不存在: ' + filePath
            }
        });
    }
    
    try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const ext = path.extname(resolvedPath).toLowerCase();
        const stats = fs.statSync(resolvedPath);
        
        // 返回 JSON 格式，方便前端处理
        res.json({
            success: true,
            path: filePath,
            name: path.basename(resolvedPath),
            ext: ext,
            size: stats.size,
            modified: stats.mtime,
            content: content
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: error.message
            }
        });
    }
});

/**
 * 获取文件信息
 * GET /api/file/info?path=/path/to/file
 */
router.get('/info', (req, res) => {
    const filePath = req.query.path;
    
    if (!filePath) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'BadRequestError',
                message: '缺少 path 参数'
            }
        });
    }
    
    if (!isPathAllowed(filePath)) {
        return res.status(403).json({
            code: 403,
            error: {
                type: 'ForbiddenError',
                message: '不允许访问该路径'
            }
        });
    }
    
    try {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        
        res.json({
            code: 200,
            data: {
                path: filePath,
                name: path.basename(filePath),
                ext: ext,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile()
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: error.message
            }
        });
    }
});

/**
 * 列出目录内容
 * GET /api/file/list?path=/path/to/dir
 */
router.get('/list', (req, res) => {
    const dirPath = req.query.path || ALLOWED_DIRS[0];
    
    if (!isPathAllowed(dirPath)) {
        return res.status(403).json({
            code: 403,
            error: {
                type: 'ForbiddenError',
                message: '不允许访问该路径'
            }
        });
    }
    
    try {
        const files = fs.readdirSync(dirPath).map(name => {
            const fullPath = path.join(dirPath, name);
            const stats = fs.statSync(fullPath);
            
            return {
                name,
                path: fullPath,
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime
            };
        });
        
        res.json({
            code: 200,
            data: {
                path: dirPath,
                files
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            error: {
                type: 'InternalError',
                message: error.message
            }
        });
    }
});

/**
 * 下载文件
 * GET /api/file/download?path=/path/to/file
 */
router.get('/download', (req, res) => {
    const filePath = req.query.path;
    
    if (!filePath) {
        return res.status(400).json({
            code: 400,
            error: {
                type: 'BadRequestError',
                message: '缺少 path 参数'
            }
        });
    }
    
    if (!isPathAllowed(filePath)) {
        return res.status(403).json({
            code: 403,
            error: {
                type: 'ForbiddenError',
                message: '不允许访问该路径'
            }
        });
    }
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            code: 404,
            error: {
                type: 'NotFoundError',
                message: '文件不存在'
            }
        });
    }
    
    const fileName = path.basename(filePath);
    res.download(filePath, fileName);
});

module.exports = router;