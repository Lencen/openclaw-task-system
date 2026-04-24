#!/usr/bin/env node
/**
 * 自我进化 - 新知识转化为工作流和技能功能
 * 功能：将提取的知识和模式转化为可执行的工作流和新技能
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '../../data');
const SELF_EVOLUTION_DIR = path.join(DATA_DIR, 'self-evolution');
const KNOWLEDGE_BASE_FILE = path.join(SELF_EVOLUTION_DIR, 'knowledge-base.json');
const WORKFLOWS_DIR = path.join(SELF_EVOLUTION_DIR, 'workflows');
const SKILLS_DIR = path.join(__dirname, '../../../skills');

// 确保目录存在
if (!fs.existsSync(WORKFLOWS_DIR)) {
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

// 读取JSON文件的辅助函数
const readJSON = (file, defaultVal) => {
  if (!fs.existsSync(file)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return defaultVal;
  }
};

// 写入JSON文件的辅助函数
const writeJSON = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

/**
 * 从知识库生成工作流
 */
function generateWorkflowsFromKnowledge(knowledgeBase) {
  const workflows = [];
  
  // 安全检查
  if (!knowledgeBase || !knowledgeBase.patterns) {
    console.log('⚠️ 知识库中没有模式数据，跳过工作流生成');
    return workflows;
  }
  
  // 基于成功模式生成优化工作流
  (knowledgeBase.patterns || []).forEach(pattern => {
    if (pattern.type === 'efficiency') {
      const workflow = {
        id: `optimize_efficiency_${Date.now()}`,
        name: '效率优化工作流',
        description: `基于"${pattern.description}"生成的效率优化工作流`,
        version: '1.0.0',
        triggers: [
          {
            type: 'schedule',
            cron: '0 */6 * * *' // 每6小时检查一次
          }
        ],
        steps: [
          {
            id: 'analyze_performance',
            name: '分析任务性能',
            action: 'custom',
            script: 'performance-analyzer.js',
            parameters: {
              threshold: 150 // 效率阈值百分比
            }
          },
          {
            id: 'identify_bottlenecks',
            name: '识别瓶颈',
            action: 'custom',
            script: 'bottleneck-identifier.js'
          },
          {
            id: 'suggest_optimizations',
            name: '生成优化建议',
            action: 'custom',
            script: 'optimization-suggester.js'
          },
          {
            id: 'apply_improvements',
            name: '应用改进',
            action: 'custom',
            script: 'improvement-applier.js',
            condition: '{{suggest_optimizations.has_suggestions}}'
          }
        ],
        createdAt: new Date().toISOString()
      };
      
      workflows.push(workflow);
    }
    
    if (pattern.type === 'quality') {
      const workflow = {
        id: `quality_assurance_${Date.now()}`,
        name: '质量保障工作流',
        description: `基于"${pattern.description}"生成的质量保障工作流`,
        version: '1.0.0',
        triggers: [
          {
            type: 'task_completion',
            condition: 'task.status === "completed"'
          }
        ],
        steps: [
          {
            id: 'validate_execution',
            name: '验证执行质量',
            action: 'custom',
            script: 'execution-validator.js'
          },
          {
            id: 'check_consistency',
            name: '检查一致性',
            action: 'custom',
            script: 'consistency-checker.js'
          },
          {
            id: 'generate_quality_report',
            name: '生成质量报告',
            action: 'custom',
            script: 'quality-reporter.js'
          },
          {
            id: 'trigger_review',
            name: '触发人工审核',
            action: 'notification',
            condition: '{{generate_quality_report.quality_score < 80}}',
            parameters: {
              message: '检测到低质量任务执行，请审核',
              recipients: ['admin']
            }
          }
        ],
        createdAt: new Date().toISOString()
      };
      
      workflows.push(workflow);
    }
  });
  
  return workflows;
}

/**
 * 从知识库生成新技能
 */
function generateSkillsFromKnowledge(knowledgeBase) {
  const skills = [];
  
  // 安全检查
  if (!knowledgeBase || !knowledgeBase.knowledgePoints) {
    console.log('⚠️ 知识库中没有知识点数据，跳过技能生成');
    return skills;
  }
  
  // 基于高频领域生成专业技能
  const domainFrequency = {};
  (knowledgeBase.knowledgePoints || []).forEach(point => {
    (point.domains || []).forEach(domain => {
      domainFrequency[domain] = (domainFrequency[domain] || 0) + 1;
    });
  });
  
  // 为高频领域生成技能
  Object.entries(domainFrequency)
    .filter(([domain, count]) => count >= 3) // 至少出现3次
    .forEach(([domain, count]) => {
      const skill = {
        name: `${domain}-expert`,
        version: '1.0.0',
        description: `基于${count}个相关任务自动生成的${domain}领域专家技能`,
        capabilities: [
          `分析${domain}相关问题`,
          `提供${domain}解决方案`,
          `优化${domain}工作流程`
        ],
        functions: [
          {
            name: `analyze_${domain}_issue`,
            description: `分析${domain}相关问题`,
            parameters: {
              type: "object",
              properties: {
                issue_description: {
                  type: "string",
                  description: "问题描述"
                }
              },
              required: ["issue_description"]
            }
          },
          {
            name: `suggest_${domain}_solution`,
            description: `为${domain}问题提供建议`,
            parameters: {
              type: "object",
              properties: {
                issue_analysis: {
                  type: "object",
                  description: "问题分析结果"
                }
              },
              required: ["issue_analysis"]
            }
          }
        ],
        implementation: `
// ${domain}专家技能实现
class ${domain.charAt(0).toUpperCase() + domain.slice(1)}Expert {
  constructor() {
    this.domain = '${domain}';
    this.experience = ${count};
  }
  
  async analyzeIssue(issueDescription) {
    // 基于历史知识分析问题
    console.log(\`分析\${this.domain}问题: \${issueDescription}\`);
    return {
      category: this.categorizeIssue(issueDescription),
      complexity: this.assessComplexity(issueDescription),
      related_patterns: this.findRelatedPatterns(issueDescription)
    };
  }
  
  categorizeIssue(description) {
    // 简单分类逻辑
    const keywords = description.toLowerCase().split(/\\s+/);
    if (keywords.some(k => ['error', 'fail', 'bug'].includes(k))) return 'technical_issue';
    if (keywords.some(k => ['slow', 'performance', 'speed'].includes(k))) return 'performance_issue';
    if (keywords.some(k => ['user', 'interface', 'ui'].includes(k))) return 'ui_issue';
    return 'general_issue';
  }
  
  assessComplexity(description) {
    // 简单复杂度评估
    const wordCount = description.split(/\\s+/).length;
    if (wordCount < 10) return 'low';
    if (wordCount < 30) return 'medium';
    return 'high';
  }
  
  findRelatedPatterns(description) {
    // 基于关键词匹配历史模式
    return [];
  }
  
  async suggestSolution(analysis) {
    // 基于分析结果提供建议
    return {
      recommended_approach: this.getRecommendedApproach(analysis.category),
      estimated_effort: this.estimateEffort(analysis.complexity),
      potential_risks: this.identifyRisks(analysis.category)
    };
  }
  
  getRecommendedApproach(category) {
    const approaches = {
      technical_issue: '检查相关日志和错误信息，定位根本原因',
      performance_issue: '分析性能瓶颈，优化相关代码或配置',
      ui_issue: '检查用户界面设计，确保符合用户体验标准',
      general_issue: '采用系统性方法分析问题，分步骤解决'
    };
    return approaches[category] || approaches.general_issue;
  }
  
  estimateEffort(complexity) {
    const estimates = {
      low: '1-2小时',
      medium: '1-2天',
      high: '1周以上'
    };
    return estimates[complexity] || estimates.medium;
  }
  
  identifyRisks(category) {
    const risks = {
      technical_issue: ['可能需要深入调试', '可能涉及依赖问题'],
      performance_issue: ['优化可能影响其他功能', '需要充分测试'],
      ui_issue: ['改动可能影响用户体验', '需要多设备测试'],
      general_issue: ['问题可能比表面复杂', '需要跨部门协调']
    };
    return risks[category] || ['需要进一步分析'];
  }
}

module.exports = ${domain.charAt(0).toUpperCase() + domain.slice(1)}Expert;
        `.trim()
      };
      
      skills.push(skill);
    });
  
  return skills;
}

/**
 * 保存工作流到文件
 */
function saveWorkflows(workflows) {
  workflows.forEach(workflow => {
    const workflowFile = path.join(WORKFLOWS_DIR, `${workflow.id}.json`);
    writeJSON(workflowFile, workflow);
  });
  
  // 更新工作流索引
  const indexFile = path.join(WORKFLOWS_DIR, 'index.json');
  const currentIndex = readJSON(indexFile, []);
  const newIndex = [...currentIndex, ...workflows.map(w => w.id)];
  writeJSON(indexFile, [...new Set(newIndex)]); // 去重
  
  return workflows.length;
}

/**
 * 保存技能到文件
 */
function saveSkills(skills) {
  skills.forEach(skill => {
    const skillDir = path.join(SKILLS_DIR, skill.name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    
    // 保存技能元数据
    const metaFile = path.join(skillDir, 'skill.json');
    writeJSON(metaFile, {
      name: skill.name,
      version: skill.version,
      description: skill.description,
      capabilities: skill.capabilities,
      createdAt: new Date().toISOString()
    });
    
    // 保存技能实现
    const implFile = path.join(skillDir, 'index.js');
    fs.writeFileSync(implFile, skill.implementation);
    
    // 保存函数定义
    const functionsFile = path.join(skillDir, 'functions.json');
    writeJSON(functionsFile, skill.functions);
  });
  
  return skills.length;
}

/**
 * 注册新技能到系统
 */
/**
 * 注册技能（检查现有技能并迭代版本）
 */
function registerSkills(skills) {
  const results = {
    registered: 0,
    updated: 0,
    skipped: 0,
    details: []
  };
  
  try {
    skills.forEach(skill => {
      const skillDir = path.join(SKILLS_DIR, skill.name);
      const skillFile = path.join(skillDir, 'SKILL.md');
      
      if (fs.existsSync(skillFile)) {
        // 技能已存在，检查版本并更新
        try {
          const content = fs.readFileSync(skillFile, 'utf8');
          const versionMatch = content.match(/\*\*版本\*\*:\s*(\d+)\.(\d+)\.(\d+)/);
          
          if (versionMatch) {
            const [, major, minor, patch] = versionMatch;
            const newMinor = parseInt(minor) + 1;
            const newVersion = `${major}.${newMinor}.${patch}`;
            
            console.log(`🔄 更新技能: ${skill.name} (v${major}.${minor}.${patch} → v${newVersion})`);
            
            // 更新版本号
            const updatedContent = content.replace(
              /\*\*版本\*\*:\s*\d+\.\d+\.\d+/,
              `**版本**: ${newVersion}`
            ).replace(
              /更新时间:\s*\d{4}-\d{2}-\d{2}/,
              `更新时间: ${new Date().toISOString().split('T')[0]}`
            );
            
            fs.writeFileSync(skillFile, updatedContent);
            results.updated++;
            results.details.push({
              name: skill.name,
              action: 'updated',
              oldVersion: `${major}.${minor}.${patch}`,
              newVersion: newVersion
            });
          } else {
            console.log(`⚠️ 无法解析版本: ${skill.name}，跳过更新`);
            results.skipped++;
          }
        } catch (err) {
          console.log(`⚠️ 更新失败: ${skill.name} - ${err.message}`);
          results.skipped++;
        }
      } else {
        // 技能不存在，创建新技能
        console.log(`➕ 创建新技能: ${skill.name}`);
        
        // 创建目录
        if (!fs.existsSync(skillDir)) {
          fs.mkdirSync(skillDir, { recursive: true });
        }
        
        // 生成 SKILL.md
        const skillContent = generateSkillMarkdown(skill);
        fs.writeFileSync(skillFile, skillContent);
        
        results.registered++;
        results.details.push({
          name: skill.name,
          action: 'created',
          version: '1.0.0'
        });
      }
    });
    
    return {
      success: true,
      ...results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      ...results
    };
  }
}

/**
 * 生成技能 Markdown 文件
 */
function generateSkillMarkdown(skill) {
  return `---
name: ${skill.name}
description: |
  ${skill.description}
  
  触发场景：${skill.name.replace('-expert', '')}相关问题、${skill.name.replace('-expert', '')}优化、${skill.name.replace('-expert', '')}工作。
  
  当需要处理${skill.name.replace('-expert', '')}相关问题时，激活此技能。
triggers:
  - ${skill.name.replace('-expert', '')}
  - ${skill.name.replace('-expert', '')}优化
  - ${skill.name.replace('-expert', '')}问题
---

# ${skill.name.charAt(0).toUpperCase() + skill.name.slice(1).replace('-expert', ' Expert')} Skill

${skill.description}

**图标**: 🎯
**版本**: 1.0.0
**类型**: 领域专家
**更新时间**: ${new Date().toISOString().split('T')[0]}

---

## 能力

${skill.capabilities.map((c, i) => `${i + 1}. ${c}`).join('\n')}

---

## 使用场景

1. 遇到${skill.name.replace('-expert', '')}相关问题时
2. 需要${skill.name.replace('-expert', '')}方案建议时
3. 需要${skill.name.replace('-expert', '')}工作优化时

---

**创建时间**: ${new Date().toISOString().split('T')[0]}
**来源**: 自我进化系统自动生成
**相关任务数**: ${skill.relatedTaskCount || 0}
`;
}

/**
 * 执行工作流和技能转化
 */
async function performWorkflowConversion() {
  console.log('🔄 开始工作流和技能转化...');
  
  try {
    // 读取知识库
    const knowledgeBase = readJSON(KNOWLEDGE_BASE_FILE, null);
    if (!knowledgeBase) {
      throw new Error('知识库不存在，请先运行知识提取');
    }
    
    console.log(`🧠 基于知识库生成工作流和技能...`);
    
    // 生成工作流
    const workflows = generateWorkflowsFromKnowledge(knowledgeBase);
    console.log(`🔧 生成工作流: ${workflows.length}`);
    
    // 生成技能
    const skills = generateSkillsFromKnowledge(knowledgeBase);
    console.log(`⚡ 生成技能: ${skills.length}`);
    
    // 保存工作流
    const savedWorkflows = saveWorkflows(workflows);
    console.log(`💾 保存工作流: ${savedWorkflows}`);
    
    // 保存技能
    const savedSkills = saveSkills(skills);
    console.log(`💾 保存技能: ${savedSkills}`);
    
    // 注册技能
    const registrationResult = registerSkills(skills);
    if (registrationResult.success) {
      console.log(`✅ 注册技能: ${registrationResult.registered}`);
    } else {
      console.log(`⚠️ 技能注册失败: ${registrationResult.error}`);
    }
    
    // 生成报告
    const conversionReport = {
      timestamp: new Date().toISOString(),
      workflowsGenerated: workflows.length,
      skillsGenerated: skills.length,
      workflowsSaved: savedWorkflows,
      skillsSaved: savedSkills,
      skillsRegistered: registrationResult.registered || 0,
      details: {
        workflowIds: workflows.map(w => w.id),
        skillNames: skills.map(s => s.name)
      }
    };
    
    // 保存转换报告
    const reportFile = path.join(SELF_EVOLUTION_DIR, 'conversion-report.json');
    writeJSON(reportFile, conversionReport);
    console.log('📊 转换报告已保存');
    
    // 输出摘要
    console.log('\n=== 转化摘要 ===');
    console.log(`工作流生成: ${workflows.length}`);
    console.log(`技能生成: ${skills.length}`);
    console.log(`注册成功: ${registrationResult.registered || 0}`);
    
    if (skills.length > 0) {
      console.log('\n新生成的技能:');
      skills.forEach((skill, index) => {
        console.log(`${index + 1}. ${skill.name} - ${skill.description}`);
      });
    }
    
    return {
      success: true,
      report: conversionReport
    };
  } catch (error) {
    console.error('❌ 工作流转化失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  performWorkflowConversion()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 工作流和技能转化完成');
        process.exit(0);
      } else {
        console.error('\n💥 工作流转化失败:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 工作流转化异常:', error);
      process.exit(1);
    });
}

module.exports = {
  generateWorkflowsFromKnowledge,
  generateSkillsFromKnowledge,
  saveWorkflows,
  saveSkills,
  registerSkills,
  performWorkflowConversion
};