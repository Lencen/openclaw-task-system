/**
 * 数据库统一入口
 * 所有数据访问都通过此模块
 */

const { getDAL } = require('./data-access-layer');
const { getIssuesDAL } = require('./issues-dal');
const { getProjectsDAL } = require('./projects-dal');
const pendingAssignmentsDAL = require('./pending-assignments-dal');
const executionLogsDAL = require('./execution-logs-dal');
const fixQueueDAL = require('./fix-queue-dal');

// 单例模式
let tasksDAL = null;
let issuesDAL = null;
let projectsDAL = null;

function getTasksDAL() {
  if (!tasksDAL) {
    tasksDAL = getDAL();
  }
  return tasksDAL;
}

function getIssues() {
  if (!issuesDAL) {
    issuesDAL = getIssuesDAL();
  }
  return issuesDAL;
}

function getProjects() {
  if (!projectsDAL) {
    projectsDAL = getProjectsDAL();
  }
  return projectsDAL;
}

module.exports = {
  tasks: {
    create: (task) => getTasksDAL().createTask(task),
    get: (id) => getTasksDAL().getTask(id),
    list: (filter) => getTasksDAL().listTasks(filter),
    update: (id, updates, options) => getTasksDAL().updateTask(id, updates, options),
    delete: (id) => getTasksDAL().deleteTask(id),
    count: (filter) => getTasksDAL().countTasks(filter),
    checkDuplicate: (messageHash, minutes) => getTasksDAL().checkDuplicateTask(messageHash, minutes),
  },
  issues: {
    create: (issue) => getIssues().create(issue),
    get: (id) => getIssues().get(id),
    list: (filter) => getIssues().list(filter),
    update: (id, updates) => getIssues().update(id, updates),
    delete: (id) => getIssues().delete(id),
    count: (filter) => getIssues().count(filter),
  },
  projects: {
    create: (project) => getProjects().create(project),
    get: (id) => getProjects().get(id),
    list: (filter) => getProjects().list(filter),
    update: (id, updates) => getProjects().update(id, updates),
    delete: (id) => getProjects().delete(id),
    count: (filter) => getProjects().count(filter),
  },
  logs: {
    create: (log) => executionLogsDAL.addLog(log),
    list: () => executionLogsDAL.listLogs(),
    latest: (limit) => executionLogsDAL.getLatestLogs(limit),
    clear: () => executionLogsDAL.clearLogs(),
    get: (id) => executionLogsDAL.getLog(id),
  },
  pendingAssignments: {
    add: (record) => pendingAssignmentsDAL.addRecord(record),
    list: () => pendingAssignmentsDAL.listRecords(),
    listByStatus: (status) => pendingAssignmentsDAL.getRecordsByStatus(status),
    listByAgent: (agentId) => pendingAssignmentsDAL.getRecordsByAgent(agentId),
    updateStatus: (id, status, processedAt) => pendingAssignmentsDAL.updateRecordStatus(id, status, processedAt),
    updateError: (id, error, incrementRetry) => pendingAssignmentsDAL.updateRecordError(id, error, incrementRetry),
    delete: (id) => pendingAssignmentsDAL.deleteRecord(id),
    clear: (status) => pendingAssignmentsDAL.clearRecords(status),
    getStats: () => pendingAssignmentsDAL.getStats(),
    migrate: () => pendingAssignmentsDAL.migrateFromJsonl(),
    fileExists: () => pendingAssignmentsDAL.fileExists(),
  },
  executionLogs: {
    add: (log) => executionLogsDAL.addLog(log),
    list: () => executionLogsDAL.listLogs(),
    latest: (limit) => executionLogsDAL.getLatestLogs(limit),
    clear: () => executionLogsDAL.clearLogs(),
    fileExists: () => executionLogsDAL.fileExists(),
  },
  fixQueue: {
    create: (record) => fixQueueDAL.create(record),
    get: (id) => fixQueueDAL.get(id),
    list: (filter) => fixQueueDAL.list(filter),
    update: (id, updates) => fixQueueDAL.update(id, updates),
    delete: (id) => fixQueueDAL.delete(id),
    count: (filter) => fixQueueDAL.count(filter),
  },
  // 原始 DAL 实例（高级操作）
  _tasksDAL: getTasksDAL,
  _issuesDAL: getIssues,
  _projectsDAL: getProjects,
  _pendingAssignmentsDAL: pendingAssignmentsDAL,
  _executionLogsDAL: executionLogsDAL,
  _fixQueueDAL: fixQueueDAL,
};