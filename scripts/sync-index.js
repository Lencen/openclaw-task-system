/**
 * 索引同步脚本
 * 同步 knowledge、documents、skills 到 SQLite 索引
 * 
 * v2.0 新增：
 * - 从 doc-name-mapping.json 读取中文名称和描述
 * - 同步到数据库的 title_cn 和 summary 字段
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./data/tasks.db');

// 加载名称映射文件
const MAPPING_FILE = path.join(__dirname, '../data/doc-name-mapping.json');
let docMapping = { docs: {}, skills: {}, pages: {} };

try {
  if (fs.existsSync(MAPPING_FILE)) {
    docMapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('加载映射文件失败:', e.message);
}

// 获取中文描述
function getChineseDesc(fileName, type = 'docs') {
  const mapping = docMapping[type] || {};
  return mapping[fileName]?.desc || mapping[fileName]?.description || null;
}

// 从文档内容提取摘要
function extractSummary(content, maxLen = 100) {
  // 移除 YAML front matter
  let text = content.replace(/^---\n.*?\n---\n/, '');
  
  // 移除标题行
  text = text.replace(/^#{1,6}\s+.+$\n/gm, '');
  
  // 移除空行和代码块标记
  text = text.replace(/^\s*\n/gm, '');
  text = text.replace(/^```\w*\n/gm, '');
  text = text.replace(/^```\n/gm, '');
  
  // 获取前几行有意义的文字
  const lines = text.split('\n').filter(line => {
    // 过滤掉无意义的行
    if (line.trim().length < 5) return false;
    if (line.startsWith('|')) return false; // 表格
    if (line.startsWith('-')) return false; // 列表
    if (line.startsWith('*')) return false;
    if (line.startsWith('>')) return false; // 引用
    if (/^\d+\./.test(line)) return false; // 数字列表
    return true;
  });
  
  if (lines.length > 0) {
    // 取第一行作为摘要，截断到指定长度
    let summary = lines[0].trim();
    if (summary.length > maxLen) {
      summary = summary.substring(0, maxLen) + '...';
    }
    return summary;
  }
  
  return null;
}

function syncKnowledge() {
  const knowledgeDir = path.resolve('../knowledge');
  if (!fs.existsSync(knowledgeDir)) return 0;
  
  const count = { added: 0, updated: 0 };
  
  function scanDir(dir, category = 'general') {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      if (item.startsWith('.')) return;
      
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath, item);
      } else if (item.endsWith('.md') && item !== 'README.md' && item !== 'DESIGN.md') {
        const relativePath = fullPath.replace('/path/to/workspace/', '');
        
        // 检查是否已存在
        const existing = db.prepare('SELECT id, file_modified_at FROM knowledge_index WHERE file_path = ?').get(relativePath);
        
        if (existing) {
          // 检查是否需要更新
          const fileTime = stat.mtime.toISOString();
          if (existing.file_modified_at !== fileTime) {
            // 更新
            const content = fs.readFileSync(fullPath, 'utf8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : item.replace('.md', '');
            
            db.prepare(`
              UPDATE knowledge_index 
              SET title = ?, updated_at = datetime('now'), file_modified_at = ?
              WHERE id = ?
            `).run(title.substring(0, 100), fileTime, existing.id);
            
            count.updated++;
          }
        } else {
          // 新增
          const content = fs.readFileSync(fullPath, 'utf8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1] : item.replace('.md', '');
          
          const id = 'know-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
          
          db.prepare(`
            INSERT INTO knowledge_index (id, title, category, file_path, created_at, file_modified_at)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
          `).run(id, title.substring(0, 100), category, relativePath, stat.mtime.toISOString());
          
          count.added++;
        }
      }
    });
  }
  
  scanDir(knowledgeDir);
  return count;
}

function syncDocuments() {
  const docsDir = path.resolve('./docs');
  if (!fs.existsSync(docsDir)) return { added: 0, updated: 0 };
  
  const count = { added: 0, updated: 0 };
  
  function scanDir(dir, category = 'general') {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      if (item.startsWith('.')) return;
      
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDir(fullPath, item);
      } else if (item.endsWith('.md')) {
        const relativePath = fullPath.replace('/path/to/workspace/task-system-v2/', '');
        const fileName = item; // 用于匹配映射
        
        const existing = db.prepare('SELECT id, file_modified_at FROM documents_index WHERE file_path = ?').get(relativePath);
        
        // 获取中文描述
        const chineseDesc = getChineseDesc(fileName, 'docs');
        
        if (existing) {
          const fileTime = stat.mtime.toISOString();
          if (existing.file_modified_at !== fileTime) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^##?\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : item.replace('.md', '');
            
            // 优先使用映射文件的描述，否则从内容提取
            let summary = chineseDesc || extractSummary(content);
            
            db.prepare(`
              UPDATE documents_index 
              SET title = ?, summary = ?, updated_at = datetime('now'), file_modified_at = ?
              WHERE id = ?
            `).run(title.substring(0, 100), summary, fileTime, existing.id);
            
            count.updated++;
          }
        } else {
          const content = fs.readFileSync(fullPath, 'utf8');
          const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^##?\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1] : item.replace('.md', '');
          
          // 优先使用映射文件的描述，否则从内容提取
          let summary = chineseDesc || extractSummary(content);
          
          const id = 'doc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
          
          db.prepare(`
            INSERT INTO documents_index (id, title, summary, category, file_path, created_at, file_modified_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
          `).run(id, title.substring(0, 100), summary, category, relativePath, stat.mtime.toISOString());
          
          count.added++;
        }
      }
    });
  }
  
  scanDir(docsDir);
  return count;
}

function syncSkills() {
  const skillsDir = path.resolve('../skills');
  if (!fs.existsSync(skillsDir)) return { added: 0, updated: 0 };
  
  const count = { added: 0, updated: 0 };
  
  const items = fs.readdirSync(skillsDir);
  items.forEach(item => {
    if (item.startsWith('.')) return;
    
    const skillPath = path.join(skillsDir, item);
    const skillFile = path.join(skillPath, 'SKILL.md');
    
    if (fs.statSync(skillPath).isDirectory() && fs.existsSync(skillFile)) {
      const relativePath = 'skills/' + item + '/';
      const stat = fs.statSync(skillFile);
      
      const existing = db.prepare('SELECT id, file_modified_at FROM skills_index WHERE skill_path = ?').get(relativePath);
      
      const content = fs.readFileSync(skillFile, 'utf8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const name = nameMatch ? nameMatch[1] : item;
      
      // 获取中文描述（技能 ID 不带 skill- 前缀）
      const skillId = item; // 如 'agent-expert'
      const chineseDesc = getChineseDesc(skillId, 'skills');
      
      if (existing) {
        const fileTime = stat.mtime.toISOString();
        if (existing.file_modified_at !== fileTime || chineseDesc) {
          db.prepare(`
            UPDATE skills_index 
            SET name = ?, description = ?, updated_at = datetime('now'), file_modified_at = ?
            WHERE id = ?
          `).run(name.substring(0, 50), chineseDesc, fileTime, existing.id);
          
          count.updated++;
        }
      } else {
        const id = 'skill-' + item;
        
        db.prepare(`
          INSERT INTO skills_index (id, name, description, skill_path, created_at, file_modified_at)
          VALUES (?, ?, ?, ?, datetime('now'), ?)
        `).run(id, name.substring(0, 50), chineseDesc, relativePath, stat.mtime.toISOString());
        
        count.added++;
      }
    }
  });
  
  return count;
}

// 执行同步
console.log('=== 索引同步 ===');
console.log('');

const knowledgeResult = syncKnowledge();
console.log('知识库索引:', knowledgeResult.added, '新增,', knowledgeResult.updated, '更新');

const documentsResult = syncDocuments();
console.log('文档索引:', documentsResult.added, '新增,', documentsResult.updated, '更新');

const skillsResult = syncSkills();
console.log('技能索引:', skillsResult.added, '新增,', skillsResult.updated, '更新');

console.log('');
console.log('✅ 同步完成');

db.close();
