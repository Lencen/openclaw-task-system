/**
 * Issues 数据访问层
 */

const SQLiteManager = require('./sqlite-manager');
const path = require('path');

class IssuesDAL {
  constructor(dbPath) {
    this.manager = new SQLiteManager(dbPath);
    this.manager.connect();
  }

  create(issue) {
    const sql = `INSERT INTO issues (
      id, title, description, status, severity, priority, category,
      task_id, project_id, reporter, assignee,
      created_at, resolved_at, root_cause, solution, resolution, reflection, tags, related_issues
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    return this.manager.run(sql, [
      issue.id,
      issue.title,
      issue.description || null,
      issue.status || 'open',
      issue.severity || 'medium',
      issue.priority || 'P2',
      issue.category || null,
      issue.task_id || null,
      issue.project_id || null,
      issue.reporter || null,
      issue.assignee || null,
      issue.created_at || new Date().toISOString(),
      issue.resolved_at || null,
      issue.root_cause || null,
      issue.solution || null,
      issue.resolution || null,
      issue.reflection || null,
      JSON.stringify(issue.tags || []),
      JSON.stringify(issue.related_issues || [])
    ]);
  }

  get(id) {
    const row = this.manager.get('SELECT * FROM issues WHERE id = ?', [id]);
    if (!row) return null;
    return this._parse(row);
  }

  list(filter = {}) {
    let sql = 'SELECT * FROM issues WHERE 1=1';
    const params = [];
    
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.severity) {
      sql += ' AND severity = ?';
      params.push(filter.severity);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    return this.manager.all(sql, params).map(row => this._parse(row));
  }

  update(id, updates) {
    const fields = [];
    const params = [];
    
    const simpleFields = ['title', 'description', 'status', 'severity', 'priority', 'category', 'assignee', 'root_cause', 'solution', 'task_id', 'project_id'];
    simpleFields.forEach(f => {
      if (updates[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(updates[f]);
      }
    });
    
    if (updates.resolved_at || updates.resolvedAt) {
      fields.push('resolved_at = ?');
      params.push(updates.resolved_at || updates.resolvedAt);
    }
    
    if (fields.length === 0) return { changes: 0 };
    
    params.push(id);
    return this.manager.run(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  delete(id) {
    return this.manager.run('DELETE FROM issues WHERE id = ?', [id]);
  }

  count(filter = {}) {
    let sql = 'SELECT COUNT(*) as count FROM issues WHERE 1=1';
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
      related_issues: JSON.parse(row.related_issues || '[]')
    };
  }
}

let instance = null;
function getIssuesDAL(dbPath) {
  if (!instance) {
    instance = new IssuesDAL(dbPath || path.join(__dirname, '../../data/tasks.db'));
  }
  return instance;
}

module.exports = { IssuesDAL, getIssuesDAL };
