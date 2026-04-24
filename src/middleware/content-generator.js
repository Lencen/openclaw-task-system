/**
 * 内容生成器 v2.0
 * 功能：生成任务预填充内容（分析、验收标准、上下文、关联文档）
 * 创建时间：2026-03-20
 */

const http = require('http');
const TASK_SYSTEM_URL = process.env.TASK_SYSTEM_URL || 'http://localhost:8081';

class ContentGenerator {
  constructor(typeRecognizer, templateSelector) {
    this.typeRecognizer = typeRecognizer;
    this.templateSelector = templateSelector;
  }

  /**
   * 生成完整的预填充内容
   */
  async generate(taskInfo, project = {}, milestone = {}) {
    // 1. 识别任务类型
    const taskType = this.typeRecognizer.recognize(
      taskInfo.title || '',
      taskInfo.description || ''
    );

    // 2. 选择模板
    const template = this.templateSelector.select(taskType, { project, milestone, task: taskInfo });

    // 3. 生成分析
    const analysis = this.generateAnalysis(taskInfo, project, milestone, template);

    // 4. 生成验收标准
    const acceptance = this.generateAcceptance(taskInfo, project, template);

    // 5. 生成项目上下文
    const context = this.generateContext(project, milestone);

    // 6. 关联文档（异步）
    const relatedDocs = await this.associateDocuments(taskInfo, project);

    return {
      analysis,
      acceptance_criteria: acceptance,
      project_context: context,
      related_docs: relatedDocs,
      taskType
    };
  }

  /**
   * 生成任务分析
   */
  generateAnalysis(taskInfo, project, milestone, template) {
    const baseThought = template.analysis?.thought || '需要分析并实施该任务。';
    const baseApproach = template.analysis?.approach || '1. 分析需求\n2. 制定计划\n3. 执行实施\n4. 验证结果';
    
    // 生成思考
    const thought = this.interpolate(baseThought, { taskInfo, project, milestone });
    
    // 生成方法
    const approach = this.interpolate(baseApproach, { taskInfo, project, milestone });

    // 生成结论
    const conclusion = this.generateConclusion(taskInfo, project, milestone);

    return {
      thought,
      conclusion,
      approach,
      estimated_complexity: template.analysis?.estimated_complexity || 'medium',
      dependencies: taskInfo.dependencies || [],
      risks: this.identifyRisks(taskInfo, project, template)
    };
  }

  /**
   * 生成结论
   */
  generateConclusion(taskInfo, project, milestone) {
    const parts = [];
    
    if (project.name) {
      parts.push(`该任务属于项目「${project.name}」`);
    }
    
    if (milestone.name) {
      parts.push(`的 ${milestone.name} 阶段`);
    } else {
      parts.push('的主流程');
    }

    if (taskInfo.priority) {
      parts.push(`，优先级为 ${taskInfo.priority}`);
    }

    return parts.join('') + '。';
  }

  /**
   * 生成验收标准
   */
  generateAcceptance(taskInfo, project, template) {
    let acceptance = template.acceptance ? [...template.acceptance] : [];

    // 根据任务复杂度增强
    const complexity = taskInfo.complexity || 'medium';
    if (complexity === 'high') {
      acceptance.push('通过性能测试');
      acceptance.push('通过安全审查');
    }

    // 根据项目类型增强
    if (project.type === 'enterprise') {
      acceptance.push('符合企业标准');
      acceptance.push('通过质量审核');
    }

    // 根据任务类型增强
    const taskType = this.typeRecognizer.recognize(taskInfo.title || '', taskInfo.description || '');
    if (taskType === 'development') {
      acceptance.push('代码符合规范');
      acceptance.push('通过代码审查');
    } else if (taskType === 'testing') {
      acceptance.push('测试覆盖率达标');
      acceptance.push('无严重缺陷');
    } else if (taskType === 'documentation') {
      acceptance.push('文档格式规范');
      acceptance.push('内容完整准确');
    }

    return acceptance;
  }

  /**
   * 生成项目上下文
   */
  generateContext(project, milestone) {
    const lines = [
      `项目名称：${project.name || '未知'}`,
      `项目版本：${project.version || '1.0'}`,
      `项目描述：${project.description || '无'}`,
      `技术栈：${project.techStack || project.tech_stack || '通用'}`,
      `当前阶段：${milestone.name || '主流程'}`,
      `项目优先级：${project.priority || 'P3'}`
    ];

    return lines.join('\n');
  }

  /**
   * 关联文档
   */
  async associateDocuments(taskInfo, project) {
    const docs = [];

    // 关联项目文档
    if (project.documents && project.documents.length > 0) {
      docs.push(...project.documents.map(doc => ({
        type: 'project',
        name: doc.name || '项目文档',
        url: doc.url || '#'
      })));
    }

    // 关联相关知识
    const keywords = this.extractKeywords(taskInfo.title || '');
    if (keywords.length > 0) {
      try {
        const response = await this.httpGet(
          `${TASK_SYSTEM_URL}/api/knowledge/query?q=${encodeURIComponent(keywords[0])}&tier=HOT`
        );
        if (response.success && response.results && response.results.length > 0) {
          docs.push({
            type: 'knowledge',
            name: `相关知识：${keywords[0]}`,
            url: `/knowledge?q=${keywords[0]}`
          });
        }
      } catch (err) {
        console.warn('[ContentGenerator] 知识检索失败:', err.message);
      }
    }

    return docs;
  }

  /**
   * 提取关键词
   */
  extractKeywords(title) {
    if (!title) return [];
    
    const stopWords = ['的', '了', '是', '在', '等', '和', '与', '及', '或'];
    const words = title.split(/[\s,，.。]/);
    return words
      .filter(w => w.length > 1 && !stopWords.includes(w))
      .slice(0, 3);
  }

  /**
   * 识别风险
   */
  identifyRisks(taskInfo, project, template) {
    const risks = [];
    const taskType = this.typeRecognizer.recognize(taskInfo.title || '', taskInfo.description || '');

    // 基于任务类型的风险
    if (taskType === 'development') {
      risks.push('技术实现风险');
      risks.push('进度延期风险');
    } else if (taskType === 'deployment') {
      risks.push('部署失败风险');
      risks.push('回滚风险');
    } else if (taskType === 'optimization') {
      risks.push('性能回退风险');
      risks.push('兼容性问题');
    }

    // 基于项目优先级
    if (project.priority === 'P0' || taskInfo.priority === 'P0') {
      risks.push('高优先级项目的质量风险');
    }

    return risks;
  }

  /**
   * 变量替换
   */
  interpolate(template, context) {
    if (!template) return '';
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'object') {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), JSON.stringify(value));
      } else {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      }
    }
    return result;
  }

  /**
   * HTTP GET 请求
   */
  httpGet(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
  }
}

module.exports = ContentGenerator;
