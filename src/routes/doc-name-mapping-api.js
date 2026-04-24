/**
 * 文档名称映射 API
 * 提供中英文文档名称映射
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const MAPPING_FILE = path.join(__dirname, '../data/doc-name-mapping.json');

/**
 * GET /api/doc-mapping
 * 获取完整的文档名称映射
 */
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(MAPPING_FILE)) {
            return res.json({
                code: 200,
                data: { pages: {}, docs: {}, skills: {} }
            });
        }
        
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        
        res.json({
            code: 200,
            data: {
                pages: mapping.pages || {},
                docs: mapping.docs || {},
                skills: mapping.skills || {}
            }
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/doc-mapping/pages
 * 获取页面名称映射
 */
router.get('/pages', (req, res) => {
    try {
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        res.json({
            code: 200,
            data: mapping.pages || {}
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/doc-mapping/docs
 * 获取文档名称映射
 */
router.get('/docs', (req, res) => {
    try {
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        res.json({
            code: 200,
            data: mapping.docs || {}
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * GET /api/doc-mapping/translate
 * 翻译单个文档名称
 * Query: ?name=xxx&type=pages|docs|skills
 */
router.get('/translate', (req, res) => {
    try {
        const { name, type = 'docs' } = req.query;
        
        if (!name) {
            return res.status(400).json({
                code: 400,
                error: { type: 'ValidationError', message: '缺少 name 参数' }
            });
        }
        
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        const typeMapping = mapping[type] || mapping.docs;
        const chineseName = typeMapping[name] || name;
        
        res.json({
            code: 200,
            data: {
                english: name,
                chinese: chineseName,
                found: !!typeMapping[name]
            }
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

/**
 * POST /api/doc-mapping
 * 添加新的文档名称映射
 */
router.post('/', (req, res) => {
    try {
        const { english, chinese, type = 'docs' } = req.body;
        
        if (!english || !chinese) {
            return res.status(400).json({
                code: 400,
                error: { type: 'ValidationError', message: '缺少 english 或 chinese 参数' }
            });
        }
        
        const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
        
        if (!mapping[type]) {
            mapping[type] = {};
        }
        
        mapping[type][english] = chinese;
        
        fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
        
        res.json({
            code: 200,
            data: { english, chinese, type },
            message: '映射已添加'
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            error: { type: 'InternalError', message: err.message }
        });
    }
});

module.exports = router;