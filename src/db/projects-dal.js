/**
 * Projects 数据访问层
 */

const SQLiteManager = require('./sqlite-manager');
const path = require('path');

class ProjectsDAL {
  constructor(dbPath) {
    this.manager = new SQLiteManager(dbPath);
    this.manager.connect();
  }

  create(project) {
    const sql = `INSERT INTO projects (
      id, name, description, status, priority, progress, owner,
      product_id, total_tasks, completed_tasks,
      deadline, created_at, tags, related_docs, milestones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    return this.manager.run(sql, [
      project.id,
      project.name,
      project.description || null,
      project.status || 'planning',
      project.priority || 'medium',
      project.progress || 0,
      project.owner || 'agent-main',
      project.product_id || null,
      project.total_tasks || 0,
      project.completed_tasks || 0,
      project.deadline || null,
      project.created_at || new Date().toISOString(),
      JSON.stringify(project.tags || []),
      JSON.stringify(project.related_docs || []),
      JSON.stringify(project.milestones || [])
    ]);
  }

  get(id) {
    const row = this.manager.get('SELECT * FROM projects WHERE id = ?', [id]);
    if (!row) return null;
    return this._parse(row);
  }

  list(filter = {}) {
    let sql = 'SELECT * FROM projects WHERE 1=1';
    const params = [];
    
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    return this.manager.all(sql, params).map(row => this._parse(row));
  }

  update(id, updates) {
    const fields = [];
    const params = [];
    
    const simpleFields = ['name', 'description', 'status', 'priority', 'progress', 'owner', 'total_tasks', 'completed_tasks'];
    simpleFields.forEach(f => {
      if (updates[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(updates[f]);
      }
    });
    
    if (updates.completed_at || updates.completedAt) {
      fields.push('completed_at = ?');
      params.push(updates.completed_at || updates.completedAt);
    }
    
    if (fields.length === 0) return { changes: 0 };
    
    params.push(id);
    return this.manager.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  delete(id) {
    return this.manager.run('DELETE FROM projects WHERE id = ?', [id]);
  }

  count(filter = {}) {
    let sql = 'SELECT COUNT(*) as count FROM projects WHERE 1=1';
    const params = [];
    
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    
    return this.manager.get(sql, params).count;
  }

  _parse(row) {
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      related_docs: JSON.parse(row.related_docs || '[]'),
      milestones: JSON.parse(row.milestones || '[]')
    };
  }
}

let instance = null;
function getProjectsDAL(dbPath) {
  if (!instance) {
    instance = new ProjectsDAL(dbPath || path.join(__dirname, '../../data/tasks.db'));
  }
  return instance;
}

module.exports = { ProjectsDAL, getProjectsDAL };
