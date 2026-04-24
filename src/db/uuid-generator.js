/**
 * UUID 生成器
 * 解决高并发时时间戳 ID 冲突问题
 */

const crypto = require('crypto');

function generateUUID(prefix = 'task') {
  const uuid = crypto.randomUUID();
  return `${prefix}-${uuid}`;
}

function generateShortId(prefix = 'task') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`;
}

module.exports = { generateUUID, generateShortId };
