#!/usr/bin/env node
/**
 * 检查清单 API
 * 提供检查清单报告的读取和查询功能
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const CHECKLISTS_DIR = path.join(__dirname, '../data/checklists');
const REPORTS_DIR = path.join(__dirname, '../data/checklists/reports');

// 确保目录存在
if (!fs.existsSync(CHECKLISTS_DIR)) {
  fs.mkdirSync(CHECKLISTS_DIR, { recursive: true });
}
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * 获取检查清单报告列表
 * GET /api/checklists/reports?type=${type}
 */
router.get('/reports', (req, res) => {
  try {
    const { type } = req.query;
    const reports = [];
    
    // 遍历报告目录
    if (fs.existsSync(REPORTS_DIR)) {
      const files = fs.readdirSync(REPORTS_DIR);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const reportPath = path.join(REPORTS_DIR, file);
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            
            // 如果指定了 type，过滤报告
            if (!type || report.type === type) {
              // Count auto-fixes from results
              const fixedCount = (report.results || []).filter(r => r.auto_fix === true).length;
              
              reports.push({
                type: report.type,
                id: report.id,
                timestamp: report.timestamp,
                total_checks: report.summary?.total || 0,
                passed: report.summary?.passed || 0,
                failed: report.summary?.failed || 0,
                fixed: fixedCount,
                filename: file
              });
            }
          } catch (e) {
            console.error(`读取报告失败: ${file}`, e);
          }
        }
      });
    }
    
    // 按创建时间排序（最新的在前）
    reports.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
    
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error('[Checklists API] 获取报告列表失败:', error);
    res.json({ success: false, error: error.message, data: [] });
  }
});

/**
 * 获取单个检查清单报告
 * GET /api/checklists/reports/${filename}
 * 支持格式:
 * - proj_xxx.json (使用前缀转换)
 * - project-proj_xxx_xxx.json (完整文件名)
 */
router.get('/reports/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    let reportPath = path.join(REPORTS_DIR, filename);
    
    // 如果直接文件不存在，尝试添加前缀
    if (!fs.existsSync(reportPath)) {
      // 尝试转换格式: proj_xxx.json -> project-proj_xxx_xxx.json
      if (filename.startsWith('proj-') && filename.endsWith('.json')) {
        const baseName = filename.substring(0, filename.length - 5); // 移除 .json
        const parts = baseName.split('-'); // proj_xxx -> ['proj', 'xxx']
        if (parts.length >= 2) {
          const newFilename = `project-${parts.join('_')}.json`;
          reportPath = path.join(REPORTS_DIR, newFilename);
        }
      }
    }
    
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('[Checklists API] 获取报告失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
