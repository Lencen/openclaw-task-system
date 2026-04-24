/**
 * 学习路径数据访问层 (DAL)
 * 将学习路径数据从 JSON 迁移到 SQLite
 */

const SQLiteManager = require('./sqlite-manager');
const path = require('path');

class LearningPathsDAL {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, '../../data/learning-paths.db');
    this.manager = new SQLiteManager(this.dbPath);
    this.manager.connect();
    this._initTables();
  }

  _initTables() {
    // 学习路径主表
    this.manager.run(`
      CREATE TABLE IF NOT EXISTS learning_paths (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT '其他',
        difficulty TEXT DEFAULT '中级',
        progress INTEGER DEFAULT 0,
        estimated_hours INTEGER DEFAULT 0,
        spent_hours INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 里程碑表
    this.manager.run(`
      CREATE TABLE IF NOT EXISTS learning_milestones (
        id TEXT PRIMARY KEY,
        path_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        hours INTEGER DEFAULT 0,
        date TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE
      )
    `);

    // 学习资源表
    this.manager.run(`
      CREATE TABLE IF NOT EXISTS learning_resources (
        id TEXT PRIMARY KEY,
        path_id TEXT NOT NULL,
        type TEXT DEFAULT '文档',
        title TEXT NOT NULL,
        url TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.manager.run(`CREATE INDEX IF NOT EXISTS idx_milestones_path ON learning_milestones(path_id)`);
    this.manager.run(`CREATE INDEX IF NOT EXISTS idx_resources_path ON learning_resources(path_id)`);
    this.manager.run(`CREATE INDEX IF NOT EXISTS idx_paths_category ON learning_paths(category)`);
  }

  // ========== 学习路径 CRUD ==========

  /**
   * 创建学习路径
   */
  createPath(path) {
    const sql = `INSERT INTO learning_paths (id, name, description, category, difficulty, progress, estimated_hours, spent_hours)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      path.id,
      path.name,
      path.description || '',
      path.category || '其他',
      path.difficulty || '中级',
      path.progress || 0,
      path.estimatedHours || 0,
      path.spentHours || 0
    ];
    return this.manager.run(sql, params);
  }

  /**
   * 获取所有学习路径（含里程碑和资源）
   */
  getAllPaths() {
    const paths = this.manager.all(`SELECT * FROM learning_paths ORDER BY created_at DESC`);
    
    return paths.map(p => {
      const milestones = this.manager.all(`SELECT * FROM learning_milestones WHERE path_id = ? ORDER BY sort_order`, [p.id]);
      const resources = this.manager.all(`SELECT * FROM learning_resources WHERE path_id = ? ORDER BY sort_order`, [p.id]);
      
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        difficulty: p.difficulty,
        progress: p.progress,
        estimatedHours: p.estimated_hours,
        spentHours: p.spent_hours,
        milestones: milestones.map(m => ({
          id: m.id,
          title: m.title,
          status: m.status,
          date: m.date || '待开始',
          hours: m.hours,
          learning: {
            progress: m.status === 'completed' ? 100 : m.status === 'current' ? 50 : 0
          },
          practice: {
            progress: 0
          }
        })),
        resources: resources.map(r => ({
          type: r.type,
          title: r.title,
          url: r.url
        }))
      };
    });
  }

  /**
   * 获取单个学习路径
   */
  getPathById(id) {
    const path = this.manager.get(`SELECT * FROM learning_paths WHERE id = ?`, [id]);
    if (!path) return null;

    const milestones = this.manager.all(`SELECT * FROM learning_milestones WHERE path_id = ? ORDER BY sort_order`, [id]);
    const resources = this.manager.all(`SELECT * FROM learning_resources WHERE path_id = ? ORDER BY sort_order`, [id]);

    return {
      ...path,
      milestones,
      resources
    };
  }

  /**
   * 更新学习路径进度
   */
  updateProgress(id, progress) {
    return this.manager.run(`UPDATE learning_paths SET progress = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`, [progress, id]);
  }

  /**
   * 删除学习路径（连同里程碑和资源）
   */
  deletePath(id) {
    return this.manager.run(`DELETE FROM learning_paths WHERE id = ?`, [id]);
  }

  // ========== 里程碑 CRUD ==========

  /**
   * 创建里程碑
   */
  createMilestone(milestone) {
    const sql = `INSERT INTO learning_milestones (id, path_id, title, status, hours, date, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return this.manager.run(sql, [
      milestone.id,
      milestone.pathId,
      milestone.title,
      milestone.status || 'pending',
      milestone.hours || 0,
      milestone.date,
      milestone.sortOrder || 0
    ]);
  }

  /**
   * 更新里程碑状态
   */
  updateMilestoneStatus(id, status, date) {
    return this.manager.run(`UPDATE learning_milestones SET status = ?, date = ? WHERE id = ?`, [status, date, id]);
  }

  /**
   * 批量创建里程碑
   */
  createMilestones(milestones) {
    const sql = `INSERT INTO learning_milestones (id, path_id, title, status, hours, date, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    milestones.forEach((m, i) => {
      this.manager.run(sql, [m.id, m.pathId, m.title, m.status || 'pending', m.hours || 0, m.date, i]);
    });
  }

  // ========== 资源 CRUD ==========

  /**
   * 创建资源
   */
  createResource(resource) {
    const sql = `INSERT INTO learning_resources (id, path_id, type, title, url, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    return this.manager.run(sql, [
      resource.id,
      resource.pathId,
      resource.type || '文档',
      resource.title,
      resource.url,
      resource.sortOrder || 0
    ]);
  }

  /**
   * 批量创建资源
   */
  createResources(resources) {
    const sql = `INSERT INTO learning_resources (id, path_id, type, title, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)`;
    resources.forEach((r, i) => {
      this.manager.run(sql, [r.id, r.pathId, r.type, r.title, r.url, i]);
    });
  }

  // ========== 统计 ==========

  /**
   * 获取统计信息
   */
  getStats() {
    const totalPaths = this.manager.get(`SELECT COUNT(*) as count FROM learning_paths`)?.count || 0;
    const totalMilestones = this.manager.get(`SELECT COUNT(*) as count FROM learning_milestones`)?.count || 0;
    const completedMilestones = this.manager.get(`SELECT COUNT(*) as count FROM learning_milestones WHERE status = 'completed'`)?.count || 0;
    const inProgressMilestones = this.manager.get(`SELECT COUNT(*) as count FROM learning_milestones WHERE status = 'current' OR status = 'in_progress'`)?.count || 0;
    const totalHours = this.manager.get(`SELECT SUM(estimated_hours) as sum FROM learning_paths`)?.sum || 0;
    const spentHours = this.manager.get(`SELECT SUM(spent_hours) as sum FROM learning_paths`)?.sum || 0;

    return {
      totalPaths,
      totalMilestones,
      completedMilestones,
      inProgressMilestones,
      totalHours,
      spentHours
    };
  }

  // ========== 数据迁移 ==========

  /**
   * 从 JSON 文件迁移数据
   */
  migrateFromJSON(jsonData) {
    const { paths, stats } = jsonData;
    
    // 清空现有数据
    this.manager.run(`DELETE FROM learning_milestones`);
    this.manager.run(`DELETE FROM learning_resources`);
    this.manager.run(`DELETE FROM learning_paths`);

    // 导入数据
    paths.forEach(path => {
      // 创建路径
      this.createPath({
        id: path.id,
        name: path.name,
        description: path.description,
        category: path.category,
        difficulty: path.difficulty,
        progress: path.progress,
        estimatedHours: path.estimatedHours,
        spentHours: path.spentHours || 0
      });

      // 创建里程碑
      path.milestones.forEach((m, i) => {
        this.createMilestone({
          id: m.id,
          pathId: path.id,
          title: m.title,
          status: m.status,
          hours: m.hours,
          date: m.date,
          sortOrder: i
        });
      });

      // 创建资源
      path.resources.forEach((r, i) => {
        this.createResource({
          id: `${path.id}-res-${i}`,
          pathId: path.id,
          type: r.type,
          title: r.title,
          url: r.url,
          sortOrder: i
        });
      });
    });

    console.log(`迁移完成: ${paths.length} 条路径, ${this.getStats().totalMilestones} 个里程碑`);
    return this.getStats();
  }

  /**
   * 导出为 JSON 格式（兼容原有格式）
   */
  exportToJSON() {
    const paths = this.getAllPaths();
    const stats = this.getStats();
    return { paths, stats };
  }

  close() {
    this.manager.close();
  }
}

module.exports = LearningPathsDAL;