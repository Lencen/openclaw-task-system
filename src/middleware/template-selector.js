/**
 * 模板选择器 v2.0
 * 功能：管理和选择合适的任务模板
 * 创建时间：2026-03-20
 */

const fs = require('fs');
const path = require('path');

class TemplateSelector {
  constructor() {
    this.templates = new Map();
    this.templatesDir = path.join(__dirname, '../templates');
    this.loadTemplates();
  }

  /**
   * 加载所有模板
   */
  loadTemplates() {
    const templateFiles = [
      'development.json',
      'design.json',
      'research.json',
      'testing.json',
      'documentation.json',
      'fix.json',
      'optimization.json',
      'deployment.json',
      'operations.json',
      'review.json',
      'general.json'
    ];

    for (const file of templateFiles) {
      const filePath = path.join(this.templatesDir, file);
      try {
        if (fs.existsSync(filePath)) {
          const template = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.templates.set(template.type, template);
          console.log(`[TemplateSelector] 加载模板：${template.type}`);
        } else {
          console.warn(`[TemplateSelector] 模板文件不存在：${filePath}`);
        }
      } catch (err) {
        console.error(`[TemplateSelector] 加载模板失败 ${file}:`, err.message);
      }
    }

    console.log(`[TemplateSelector] 共加载 ${this.templates.size} 个模板`);
  }

  /**
   * 选择模板
   * @param {string} taskType - 任务类型
   * @param {object} context - 上下文信息
   * @returns {object} 选中的模板
   */
  select(taskType, context = {}) {
    let template = this.templates.get(taskType);
    
    if (!template) {
      console.warn(`[TemplateSelector] 未找到模板：${taskType}，使用默认模板`);
      template = this.getDefaultTemplate();
    }

    // 根据上下文增强模板
    return this.enhanceTemplate(template, context);
  }

  /**
   * 增强模板（变量替换）
   */
  enhanceTemplate(template, context) {
    const enhanced = JSON.parse(JSON.stringify(template));
    const variables = {
      projectName: context.project?.name || '未知项目',
      projectVersion: context.project?.version || '1.0',
      techStack: context.project?.techStack || '通用',
      milestoneName: context.milestone?.name || '主流程',
      taskTitle: context.task?.title || '任务',
      taskDescription: context.task?.description || ''
    };

    // 递归替换变量
    this.replaceVariables(enhanced, variables);
    
    return enhanced;
  }

  /**
   * 替换变量
   */
  replaceVariables(obj, variables) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        for (const [varName, value] of Object.entries(variables)) {
          obj[key] = obj[key].replace(new RegExp(`\\{${varName}\\}`, 'g'), value);
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.replaceVariables(obj[key], variables);
      }
    }
  }

  /**
   * 获取默认模板
   */
  getDefaultTemplate() {
    return {
      type: 'general',
      name: '通用任务模板',
      version: '1.0',
      analysis: {
        thought: '需要根据任务描述进行分析和实施。',
        approach: '1. 分析需求\n2. 制定计划\n3. 执行实施\n4. 验证结果',
        estimated_complexity: 'medium'
      },
      acceptance: [
        '功能符合需求描述',
        '通过基本测试'
      ]
    };
  }

  /**
   * 获取所有可用模板
   */
  getAllTemplates() {
    return Array.from(this.templates.values()).map(t => ({
      type: t.type,
      name: t.name,
      version: t.version
    }));
  }

  /**
   * 保存模板
   */
  saveTemplate(type, templateData) {
    const filePath = path.join(this.templatesDir, `${type}.json`);
    fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2));
    this.templates.set(type, templateData);
    console.log(`[TemplateSelector] 模板已保存：${type}`);
  }
}

module.exports = TemplateSelector;
