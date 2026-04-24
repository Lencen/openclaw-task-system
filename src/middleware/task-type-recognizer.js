/**
 * 任务类型识别器 v2.0
 * 功能：识别任务所属的类型（开发、设计、调研、测试等11种）
 * 创建时间：2026-03-20
 */

class TypeRecognizer {
  constructor() {
    this.typePatterns = {
      'development': {
        keywords: ['开发', '实现', '编写', '代码', '功能', '模块', '接口', 'API', '服务'],
        weight: 1.0,
        description: '开发类任务'
      },
      'design': {
        keywords: ['设计', '架构', '方案', '规划', '蓝图', '建模', '原型'],
        weight: 1.0,
        description: '设计类任务'
      },
      'research': {
        keywords: ['调研', '研究', '分析', '评估', '探索', '调研', '对比'],
        weight: 1.0,
        description: '调研类任务'
      },
      'testing': {
        keywords: ['测试', '验证', '验收', '用例', '质检', '测通', '联调'],
        weight: 1.0,
        description: '测试类任务'
      },
      'documentation': {
        keywords: ['文档', '文档化', '说明', '手册', '编写文档', '注释', 'README', '用户手册'],
        weight: 1.2,
        description: '文档类任务'
      },
      'fix': {
        keywords: ['修复', 'bug', '问题', '缺陷', '故障', '错误', '异常', '报错'],
        weight: 1.0,
        description: '修复类任务'
      },
      'optimization': {
        keywords: ['优化', '改进', '提升', '重构', '性能', '加速', '简化'],
        weight: 1.0,
        description: '优化类任务'
      },
      'deployment': {
        keywords: ['部署', '发布', '上线', '交付', '投产', '上线', 'env'],
        weight: 1.0,
        description: '部署类任务'
      },
      'operations': {
        keywords: ['监控', '告警', '巡检', '维护', '运维', '备份', '恢复'],
        weight: 1.0,
        description: '运维类任务'
      },
      'review': {
        keywords: ['评审', '审查', '审核', '验收', '审批', '代码审查', 'review'],
        weight: 1.0,
        description: '评审类任务'
      },
      'general': {
        keywords: [],
        weight: 0.5,
        description: '通用类任务'
      }
    };
  }

  /**
   * 识别任务类型
   * @param {string} title - 任务标题
   * @param {string} description - 任务描述
   * @param {object} context - 上下文信息
   * @returns {string} 任务类型
   */
  recognize(title, description = '', context = {}) {
    const text = `${title} ${description}`.toLowerCase();
    const scores = {};

    // 计算每个类型的匹配度
    for (const [type, { keywords, weight }] of Object.entries(this.typePatterns)) {
      scores[type] = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          scores[type] += weight;
        }
      }
    }

    // 返回得分最高的类型
    const sortedTypes = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    const bestMatch = sortedTypes[0];
    
    // 如果最高分为0，返回'general'
    if (bestMatch[1] === 0) {
      return 'general';
    }

    return bestMatch[0];
  }

  /**
   * 识别任务类型（带详细信息）
   * @param {string} title - 任务标题
   * @param {string} description - 任务描述
   * @returns {object} 识别结果
   */
  recognizeWithDetails(title, description = '') {
    const type = this.recognize(title, description);
    const details = this.typePatterns[type];

    return {
      type,
      description: details.description,
      confidence: details.weight,
      matchedKeywords: this.getMatchedKeywords(title, description, type)
    };
  }

  /**
   * 获取匹配的关键词
   */
  getMatchedKeywords(title, description, type) {
    const text = `${title} ${description}`.toLowerCase();
    const keywords = this.typePatterns[type]?.keywords || [];
    return keywords.filter(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * 获取所有支持的任务类型
   */
  getSupportedTypes() {
    return Object.keys(this.typePatterns).map(key => ({
      type: key,
      description: this.typePatterns[key].description,
      keywordCount: this.typePatterns[key].keywords.length
    }));
  }
}

module.exports = TypeRecognizer;
