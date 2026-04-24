/**
 * 文档和技能 API
 * 动态获取文档和技能列表
 */

const fs = require('fs');
const path = require('path');

// 文档目录
const DOCS_DIRS = [
  {
    name: 'OpenClaw 文档',
    path: path.join(process.env.HOME, '.openclaw/workspace/docs'),
    type: 'openclaw'
  },
  {
    name: '任务系统文档',
    path: path.join(process.env.HOME, '.openclaw/workspace/task-system-v2/docs'),
    type: 'task-system'
  },
  {
    name: '知识库同步文档',
    path: path.join(process.env.HOME, '.openclaw/workspace/kb-sync/docs'),
    type: 'kb-sync'
  },
  {
    name: 'Feishu Bridge 文档',
    path: path.join(process.env.HOME, '.openclaw/workspace/feishu-bridge/docs'),
    type: 'feishu-bridge'
  }
];

// 技能目录
const SKILLS_DIRS = [
  {
    name: '工作区技能',
    path: path.join(process.env.HOME, '.openclaw/workspace/skills'),
    type: 'workspace'
  },
  {
    name: '系统技能',
    path: path.join(process.env.HOME, '.npm-global/lib/node_modules/openclaw/skills'),
    type: 'system'
  },
  {
    name: '自我进化技能',
    path: path.join(process.env.HOME, '.openclaw/workspace/task-system-v2/data/self-evolution/generated-skills'),
    type: 'evolution'
  }
];

/**
 * 递归获取目录下的所有文档
 */
function scanDocsRecursive(dirPath, dir, docs, search) {
  if (!fs.existsSync(dirPath)) return;
  
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      // 递归扫描子目录
      scanDocsRecursive(itemPath, dir, docs, search);
      continue;
    }
    
    // 只处理文档文件
    if (!item.match(/\.(md|pdf|docx?|xlsx?|html)$/i)) continue;
    
    // 搜索过滤
    if (search && !item.toLowerCase().includes(search.toLowerCase())) continue;
    
    const ext = path.extname(item).toLowerCase();
    const iconMap = {
      '.md': 'md',
      '.pdf': 'pdf',
      '.doc': 'doc',
      '.docx': 'doc',
      '.xls': 'xls',
      '.xlsx': 'xls',
      '.html': 'md'
    };
    
    // 计算相对路径（用于分类显示）
    const relativePath = path.relative(dir.path, itemPath);
    const subCategory = path.dirname(relativePath);
    const category = subCategory && subCategory !== '.' 
      ? `${dir.name} / ${subCategory}` 
      : dir.name;
    
    // 提取标题
    let title = item
      .replace(/\.(md|pdf|docx?|xlsx?|html)$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2}-/, '')
      .replace(/-v\d+\.\d+$/, '')
      .replace(/-/g, ' ');
    
    // 提取标签
    const tags = [];
    if (item.includes('agent') || item.includes('Agent')) tags.push('Agent');
    if (item.includes('openclaw') || item.includes('OpenClaw')) tags.push('OpenClaw');
    if (item.includes('task') || item.includes('任务')) tags.push('任务');
    if (item.includes('api') || item.includes('API')) tags.push('API');
    if (item.includes('部署') || item.includes('deploy')) tags.push('部署');
    if (item.includes('设计') || item.includes('design')) tags.push('设计');
    if (item.includes('文档') || item.includes('doc')) tags.push('文档');
    if (item.includes('nvidia') || item.includes('NVIDIA')) tags.push('NVIDIA');
    if (item.includes('限流') || item.includes('rate-limit')) tags.push('限流');
    if (dir.type === 'openclaw') tags.push('OpenClaw');
    if (dir.type === 'task-system') tags.push('任务系统');
    if (dir.type === 'kb-sync') tags.push('知识库');
    if (dir.type === 'feishu-bridge') tags.push('飞书');
    
    docs.push({
      id: `${dir.type}-${relativePath.replace(/\//g, '_')}`,
      title: title,
      fileName: item,
      path: itemPath,
      relativePath: relativePath,
      type: dir.type,
      category: category,
      icon: iconMap[ext] || 'doc',
      ext: ext,
      size: formatSize(stat.size),
      sizeBytes: stat.size,
      modified: stat.mtime.toISOString().split('T')[0],
      tags: tags.slice(0, 3)
    });
  }
}

/**
 * 获取文档列表
 */
async function getDocs(req, res) {
  try {
    const docs = [];
    const { type, search } = req.query;
    
    for (const dir of DOCS_DIRS) {
      // 过滤类型
      if (type && type !== 'all' && type !== dir.type) continue;
      
      // 递归扫描文档
      scanDocsRecursive(dir.path, dir, docs, search);
    }
    
    // 按修改时间排序
    docs.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({
      success: true,
      total: docs.length,
      data: docs
    });
  } catch (error) {
    console.error('[Docs API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取技能列表
 */
async function getSkills(req, res) {
  try {
    const skills = [];
    const { type, search } = req.query;
    
    for (const dir of SKILLS_DIRS) {
      // 过滤类型
      if (type && type !== 'all' && type !== dir.type) continue;
      
      if (!fs.existsSync(dir.path)) continue;
      
      const skillDirs = fs.readdirSync(dir.path);
      
      for (const skillName of skillDirs) {
        const skillPath = path.join(dir.path, skillName);
        const stat = fs.statSync(skillPath);
        
        if (!stat.isDirectory()) continue;
        
        // 搜索过滤
        if (search && !skillName.toLowerCase().includes(search.toLowerCase())) continue;
        
        // 读取 SKILL.md
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        let description = '';
        let icon = '🔧';
        
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          // 提取描述（第一段非标题内容）
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.length > 10) {
              description = trimmed.slice(0, 100);
              break;
            }
          }
          // 提取图标
          const iconMatch = content.match(/icon:\s*([^\n]+)/i);
          if (iconMatch) icon = iconMatch[1].trim();
        }
        
        // 从技能名称推断图标
        const iconMap = {
          'browser': '🌐',
          'feishu': '📝',
          'doc': '📄',
          'excel': '📊',
          'media': '🎬',
          'image': '🖼️',
          'weather': '🌤️',
          'task': '📋',
          'agent': '🤖',
          'deploy': '🚀',
          'health': '💊',
          'tavily': '🔍',
          'weekly': '📅',
          'report': '📊',
          'ui': '🎨',
          'video': '🎥',
          'canvas': '🖼️',
          'slack': '💬',
          'discord': '🎮',
          'github': '🐙',
          'openai': '🧠',
          'weather': '🌡️',
          'notion': '📓',
          'obsidian': '💎',
          'voice': '🎙️',
          'tts': '🔊',
          'skill': '🛠️',
          'clawhub': '🏪',
          'mcporter': '🔌',
          'git': '📦',
          'evolution': '🧬',
          'self-evolution': '🧬',
          'optimize': '⚡',
          'quality': '✅'
        };
        
        for (const [key, value] of Object.entries(iconMap)) {
          if (skillName.toLowerCase().includes(key)) {
            icon = value;
            break;
          }
        }
        
        // 从技能名称生成描述
        if (!description) {
          const nameWords = skillName.replace(/-/g, ' ').split(' ');
          description = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' 技能';
        }
        
        skills.push({
          id: `${dir.type}-${skillName}`,
          name: skillName,
          displayName: skillName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: description,
          icon: icon,
          type: dir.type,
          typeName: dir.type === 'workspace' ? '工作区' : dir.type === 'system' ? '系统' : '自我进化',
          category: dir.name,
          path: skillPath,
          installed: dir.type === 'workspace' || dir.type === 'evolution',
          version: '1.0.0'
        });
      }
    }
    
    // 按名称排序
    skills.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      success: true,
      total: skills.length,
      data: skills
    });
  } catch (error) {
    console.error('[Skills API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 创建 Express Router
 */
const { exec } = require('child_process');
const routeExpress = require('express');
const router = routeExpress.Router();

// 读取映射文件
const DATA_DIR = path.join(__dirname, '..', 'data');
const SKILL_MAPPING_FILE = path.join(DATA_DIR, 'doc-name-mapping.json');

/**
 * 获取单个技能详情
 */
async function getSkill(req, res) {
  try {
    const { id } = req.params;
    
    // 尝试从多个目录查找技能
    const skillDirs = [
      path.join(process.env.HOME, '.openclaw/workspace/skills'),
      path.join(process.env.HOME, '.npm-global/lib/node_modules/openclaw/skills'),
      path.join(__dirname, '..', 'data', 'self-evolution', 'generated-skills')
    ];
    
    let skillPath = null;
    let skillDir = null;
    
    for (const dir of skillDirs) {
      const skillPathCheck = path.join(dir, id, 'SKILL.md');
      if (fs.existsSync(skillPathCheck)) {
        skillPath = skillPathCheck;
        skillDir = dir;
        break;
      }
    }
    
    if (!skillPath) {
      return res.status(404).json({ success: false, error: '技能不存在' });
    }
    
    // 读取映射
    let mappingInfo = {};
    if (fs.existsSync(SKILL_MAPPING_FILE)) {
      const mapping = JSON.parse(fs.readFileSync(SKILL_MAPPING_FILE, 'utf-8'));
      mappingInfo = mapping.skills[id] || {};
    }
    
    // 读取技能内容
    const content = fs.readFileSync(skillPath, 'utf-8');
    
    // 确定技能类型
    let type = 'workspace';
    if (skillDir.includes('npm-global')) {
      type = 'system';
    } else if (skillDir.includes('generated-skills')) {
      type = 'evolution';
    }
    
    res.json({
      success: true,
      skill: {
        id,
        name: mappingInfo.name || id,
        description: mappingInfo.desc || '',
        category: mappingInfo.category || '其他',
        type,
        typeName: type === 'workspace' ? '工作区' : type === 'system' ? '系统' : '自我进化',
        content,
        path: skillPath
      }
    });
  } catch (error) {
    console.error('[Get Skill] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// 根路由 - 测试用
router.get('/', (req, res) => {
  res.json({ message: 'Docs & Skills API', docs: '/docs', skills: '/skills' });
});

// 主路由
router.get('/docs', getDocs);
router.get('/skills', getSkills);

// 获取单个文档内容
router.get('/docs/:id', (req, res) => {
  const docId = req.params.id;
  const db = require('better-sqlite3')(path.join(process.env.HOME, '.openclaw/workspace/task-system-v2/data/tasks.db'));
  
  try {
    const doc = db.prepare('SELECT * FROM documents_index WHERE id = ?').get(docId);
    
    if (!doc) {
      return res.status(404).json({ success: false, error: '文档不存在' });
    }
    
    // 读取文档内容
    const docPath = path.join(process.env.HOME, '.openclaw/workspace', doc.file_path);
    
    if (!fs.existsSync(docPath)) {
      return res.status(404).json({ success: false, error: '文档文件不存在' });
    }
    
    const content = fs.readFileSync(docPath, 'utf-8');
    
    res.json({
      success: true,
      data: {
        ...doc,
        content
      }
    });
  } catch (error) {
    console.error('[Get Doc] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    db.close();
  }
});

// 获取单个技能详情
router.get('/skills/:id', getSkill);

// 安装技能
router.post('/skills/install', async (req, res) => {
  const { skillId, skillName } = req.body;
  
  if (!skillName) {
    return res.status(400).json({ success: false, error: '缺少技能名称' });
  }
  
  // 只支持系统技能安装
  if (!skillId || !skillId.startsWith('system-')) {
    return res.status(400).json({ success: false, error: '只支持安装系统技能' });
  }
  
  try {
    // 使用 npm 安装 OpenClaw 技能包
    const packageName = `@openclaw/skill-${skillName}`;
    const installCmd = `npm install -g ${packageName}`;
    
    console.log(`[Skills] 安装技能: ${installCmd}`);
    
    exec(installCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Skills] 安装失败:`, error);
        return res.json({ success: false, error: stderr || error.message });
      }
      
      console.log(`[Skills] 安装成功: ${skillName}`);
      res.json({ success: true, message: `技能 ${skillName} 安装成功`, output: stdout });
    });
  } catch (e) {
    console.error(`[Skills] 安装异常:`, e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
