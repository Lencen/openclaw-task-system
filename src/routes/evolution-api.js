/**
 * 进化记录 API 路由
 * 提供进化记录页面所需的数据接口
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data/self-evolution');

// 读取 JSON 文件辅助函数
const readJSON = (file, defaultVal = {}) => {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
};

/**
 * 获取进化记录列表
 */
router.get('/list', (req, res) => {
  try {
    const type = req.query.type || 'all';
    const historyFile = path.join(DATA_DIR, 'evolution-history.json');
    const history = readJSON(historyFile, []);
    
    // 转换数据格式为页面需要的格式
    const records = history.map(evo => {
      // 根据进化内容判断类型
      let evoType = 'learn';
      let title = `进化 #${evo.id.split('_')[1]}`;
      let description = '';
      
      if (evo.summary) {
        const { skillsGenerated, workflowsGenerated, knowledgePoints, patternsIdentified } = evo.summary;
        
        if (skillsGenerated > 0) {
          evoType = 'skill';
          title = `生成 ${skillsGenerated} 个新技能`;
          description = `基于 ${evo.details?.review?.completedTasks || 0} 个任务，提取 ${knowledgePoints} 个知识点，识别 ${patternsIdentified} 个模式，生成 ${skillsGenerated} 个领域专家技能`;
        } else if (workflowsGenerated > 0) {
          evoType = 'optimize';
          title = `生成 ${workflowsGenerated} 个自动化工作流`;
          description = `识别重复模式并转化为自动化工作流`;
        } else {
          evoType = 'learn';
          title = `知识积累 - ${knowledgePoints} 个知识点`;
          description = `从任务中提取知识点并更新知识库`;
        }
      }
      
      return {
        id: evo.id,
        title,
        description,
        type: evoType,
        date: evo.date || new Date(evo.timestamp).toISOString().split('T')[0],
        time: new Date(evo.timestamp).toLocaleTimeString('zh-CN'),
        agent: 'self-evolution',
        tags: evo.summary ? [
          `知识点: ${evo.summary.knowledgePoints}`,
          `技能: ${evo.summary.skillsGenerated}`,
          `模式: ${evo.summary.patternsIdentified}`
        ] : [],
        relatedFiles: [],
        raw: evo
      };
    });
    
    // 按类型过滤
    const filteredRecords = type === 'all' 
      ? records 
      : records.filter(r => r.type === type);
    
    // 统计
    const stats = {
      total: records.length,
      byType: {
        skill: records.filter(r => r.type === 'skill').length,
        fix: records.filter(r => r.type === 'fix').length,
        optimize: records.filter(r => r.type === 'optimize').length,
        learn: records.filter(r => r.type === 'learn').length
      }
    };
    
    res.json({
      success: true,
      data: filteredRecords,
      stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单条进化记录详情
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const historyFile = path.join(DATA_DIR, 'evolution-history.json');
    const history = readJSON(historyFile, []);
    
    const evo = history.find(e => e.id === id);
    if (!evo) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }
    
    // 构建详细信息
    let evoType = 'learn';
    let title = `进化 #${evo.id.split('_')[1]}`;
    let description = '';
    
    if (evo.summary) {
      if (evo.summary.skillsGenerated > 0) {
        evoType = 'skill';
        title = `生成 ${evo.summary.skillsGenerated} 个新技能`;
      } else if (evo.summary.workflowsGenerated > 0) {
        evoType = 'optimize';
        title = `生成 ${evo.summary.workflowsGenerated} 个自动化工作流`;
      }
      
      description = `
## 进化摘要

- **任务回顾**: ${evo.summary.tasksReviewed} 个任务
- **知识点提取**: ${evo.summary.knowledgePoints} 个
- **模式识别**: ${evo.summary.patternsIdentified} 个
- **工作流生成**: ${evo.summary.workflowsGenerated} 个
- **技能生成**: ${evo.summary.skillsGenerated} 个

## 详细信息

${evo.details?.review?.problemPatterns?.length ? `
### 识别的问题模式
${evo.details.review.problemPatterns.map(p => `- ${p.pattern}: ${p.count} 次`).join('\n')}
` : ''}

${evo.details?.review?.improvementSuggestions?.length ? `
### 改进建议
${evo.details.review.improvementSuggestions.slice(0, 5).map(s => `- ${s.suggestion}`).join('\n')}
` : ''}
      `.trim();
    }
    
    res.json({
      success: true,
      data: {
        id: evo.id,
        title,
        description,
        type: evoType,
        date: evo.date || new Date(evo.timestamp).toISOString().split('T')[0],
        agent: 'self-evolution',
        tags: evo.summary ? [
          `知识点: ${evo.summary.knowledgePoints}`,
          `技能: ${evo.summary.skillsGenerated}`,
          `模式: ${evo.summary.patternsIdentified}`
        ] : [],
        relatedFiles: [],
        raw: evo
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;