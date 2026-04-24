/**
 * 评审服务 - 任务管理平台 V3
 * 
 * 功能：
 * 1. 评审流程管理
 * 2. 评审状态追踪
 * 3. 评审历史记录
 * 
 * @version 1.0.0
 * @created 2026-03-19
 */

const db = require('../utils/db');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

function getReviews() {
  try {
    if (!fs.existsSync(REVIEWS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf-8'));
  } catch { return []; }
}

function saveReviews(reviews) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
}

const ReviewService = {
  /**
   * 创建评审请求
   */
  async create(data) {
    const reviews = getReviews();
    const review = {
      id: db.generateId('review'),
      task_id: data.task_id,
      type: data.type || 'code', // code, design, docs
      status: 'pending',
      title: data.title,
      description: data.description || '',
      requester: data.requester,
      reviewers: data.reviewers || [],
      comments: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    reviews.push(review);
    saveReviews(reviews);
    return review;
  },

  /**
   * 获取评审列表
   */
  async getAll(options = {}) {
    const { task_id, type, status, limit = 50, offset = 0 } = options;
    let reviews = getReviews();

    if (task_id) reviews = reviews.filter(r => r.task_id === task_id);
    if (type) reviews = reviews.filter(r => r.type === type);
    if (status) reviews = reviews.filter(r => r.status === status);

    return reviews.slice(offset, offset + limit);
  },

  /**
   * 获取单个评审
   */
  async getById(id) {
    const reviews = getReviews();
    return reviews.find(r => r.id === id) || null;
  },

  /**
   * 添加评审评论
   */
  async addComment(reviewId, comment) {
    const reviews = getReviews();
    const review = reviews.find(r => r.id === reviewId);
    if (!review) throw new Error('评审不存在');

    review.comments.push({
      id: db.generateId('comment'),
      author: comment.author,
      content: comment.content,
      created_at: new Date().toISOString()
    });
    review.updated_at = new Date().toISOString();
    saveReviews(reviews);
    return review;
  },

  /**
   * 更新评审状态
   */
  async updateStatus(reviewId, status) {
    const reviews = getReviews();
    const review = reviews.find(r => r.id === reviewId);
    if (!review) throw new Error('评审不存在');

    const validStatuses = ['pending', 'in_review', 'approved', 'rejected', 'changes_requested'];
    if (!validStatuses.includes(status)) throw new Error('无效状态');

    review.status = status;
    review.updated_at = new Date().toISOString();
    saveReviews(reviews);
    return review;
  },

  /**
   * 删除评审
   */
  async delete(id) {
    const reviews = getReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) return false;
    reviews.splice(index, 1);
    saveReviews(reviews);
    return true;
  }
};

module.exports = ReviewService;