/**
 * 方案评审中间件
 * 
 * 实现多 Agent 评审投票机制
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '../data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化评审数据
if (!fs.existsSync(REVIEWS_FILE)) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify({ reviews: [] }, null, 2));
}

/**
 * 创建评审请求
 * @param {Object} proposal - 方案信息
 * @param {string} proposal.title - 方案标题
 * @param {string} proposal.content - 方案内容
 * @param {string} proposal.type - 方案类型 (config|feature|process)
 * @param {string[]} reviewers - 评审人列表
 * @param {number} timeout - 超时时间（秒）
 * @returns {Object} 评审结果
 */
function createReview(proposal, reviewers, timeout = 300) {
  const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const review = {
    id: reviewId,
    proposal: {
      title: proposal.title,
      content: proposal.content,
      type: proposal.type || 'general',
      file: proposal.file || null
    },
    reviewers: reviewers.map(r => ({
      agentId: r,
      vote: null,
      score: null,
      comment: null,
      votedAt: null
    })),
    status: 'pending',
    createdAt: new Date().toISOString(),
    timeoutAt: new Date(Date.now() + timeout * 1000).toISOString(),
    result: null,
    approvedBy: [],
    rejectedBy: []
  };
  
  // 保存评审
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  data.reviews.push(review);
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(data, null, 2));
  
  return {
    reviewId,
    status: 'pending',
    reviewers,
    timeout
  };
}

/**
 * 提交评审投票
 * @param {string} reviewId - 评审 ID
 * @param {string} agentId - Agent ID
 * @param {string} vote - 投票结果 (approve|reject|abstain)
 * @param {number} score - 评分 (1-5)
 * @param {string} comment - 评审意见
 * @returns {Object} 投票结果
 */
function submitVote(reviewId, agentId, vote, score = null, comment = null) {
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  const review = data.reviews.find(r => r.id === reviewId);
  
  if (!review) {
    return { error: '评审不存在', code: 404 };
  }
  
  if (review.status !== 'pending') {
    return { error: '评审已结束', code: 400 };
  }
  
  // 检查是否超时
  if (new Date() > new Date(review.timeoutAt)) {
    review.status = 'timeout';
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(data, null, 2));
    return { error: '评审已超时', code: 408 };
  }
  
  // 查找评审人
  const reviewer = review.reviewers.find(r => r.agentId === agentId);
  if (!reviewer) {
    return { error: '您不是此评审的评审人', code: 403 };
  }
  
  // 记录投票
  reviewer.vote = vote;
  reviewer.score = score;
  reviewer.comment = comment;
  reviewer.votedAt = new Date().toISOString();
  
  // 更新统计
  if (vote === 'approve') {
    if (!review.approvedBy.includes(agentId)) {
      review.approvedBy.push(agentId);
    }
    review.rejectedBy = review.rejectedBy.filter(a => a !== agentId);
  } else if (vote === 'reject') {
    if (!review.rejectedBy.includes(agentId)) {
      review.rejectedBy.push(agentId);
    }
    review.approvedBy = review.approvedBy.filter(a => a !== agentId);
  }
  
  // 检查是否所有人已投票
  const votedCount = review.reviewers.filter(r => r.vote !== null).length;
  const allVoted = votedCount === review.reviewers.length;
  
  // 决定结果
  if (allVoted) {
    const approveCount = review.approvedBy.length;
    const rejectCount = review.rejectedBy.length;
    
    // 多数通过规则
    if (approveCount > rejectCount) {
      review.status = 'approved';
      review.result = 'approved';
    } else if (rejectCount > approveCount) {
      review.status = 'rejected';
      review.result = 'rejected';
    } else {
      // 平票时，由 main agent 决定
      review.status = 'tie';
      review.result = 'pending_main_decision';
    }
  }
  
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(data, null, 2));
  
  return {
    reviewId,
    agentId,
    vote,
    score,
    votedCount,
    totalCount: review.reviewers.length,
    allVoted,
    currentStatus: review.status
  };
}

/**
 * 获取评审状态
 * @param {string} reviewId - 评审 ID
 * @returns {Object} 评审状态
 */
function getReviewStatus(reviewId) {
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  const review = data.reviews.find(r => r.id === reviewId);
  
  if (!review) {
    return { error: '评审不存在', code: 404 };
  }
  
  return {
    reviewId: review.id,
    proposal: review.proposal,
    status: review.status,
    result: review.result,
    createdAt: review.createdAt,
    timeoutAt: review.timeoutAt,
    reviewers: review.reviewers.map(r => ({
      agentId: r.agentId,
      voted: r.vote !== null,
      vote: r.vote,
      score: r.score,
      comment: r.comment,
      votedAt: r.votedAt
    })),
    stats: {
      total: review.reviewers.length,
      voted: review.reviewers.filter(r => r.vote !== null).length,
      approved: review.approvedBy.length,
      rejected: review.rejectedBy.length
    }
  };
}

/**
 * 获取待处理的评审列表
 * @param {string} agentId - Agent ID（可选，筛选自己参与的评审）
 * @returns {Object[]} 待处理评审列表
 */
function getPendingReviews(agentId = null) {
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  
  let reviews = data.reviews.filter(r => r.status === 'pending');
  
  if (agentId) {
    reviews = reviews.filter(r => 
      r.reviewers.some(rev => rev.agentId === agentId && rev.vote === null)
    );
  }
  
  return reviews.map(r => ({
    reviewId: r.id,
    title: r.proposal.title,
    type: r.proposal.type,
    createdAt: r.createdAt,
    timeoutAt: r.timeoutAt,
    pendingReviewers: r.reviewers.filter(rev => rev.vote === null).map(rev => rev.agentId)
  }));
}

/**
 * 结束评审（强制）
 * @param {string} reviewId - 评审 ID
 * @param {string} decision - 最终决定 (approved|rejected)
 * @param {string} reason - 理由
 * @returns {Object} 结果
 */
function concludeReview(reviewId, decision, reason = null) {
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  const review = data.reviews.find(r => r.id === reviewId);
  
  if (!review) {
    return { error: '评审不存在', code: 404 };
  }
  
  review.status = decision;
  review.result = decision;
  review.conclusionReason = reason;
  review.concludedAt = new Date().toISOString();
  
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(data, null, 2));
  
  return {
    reviewId,
    status: decision,
    reason
  };
}

/**
 * 获取评审历史
 * @param {string} proposalType - 方案类型（可选）
 * @param {number} limit - 返回数量限制
 * @returns {Object[]} 评审历史
 */
function getReviewHistory(proposalType = null, limit = 20) {
  const data = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  
  let reviews = data.reviews.filter(r => r.status !== 'pending');
  
  if (proposalType) {
    reviews = reviews.filter(r => r.proposal.type === proposalType);
  }
  
  // 按时间倒序
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  return reviews.slice(0, limit).map(r => ({
    reviewId: r.id,
    title: r.proposal.title,
    type: r.proposal.type,
    status: r.status,
    result: r.result,
    createdAt: r.createdAt,
    concludedAt: r.concludedAt || null,
    stats: {
      approved: r.approvedBy.length,
      rejected: r.rejectedBy.length
    }
  }));
}

module.exports = {
  createReview,
  submitVote,
  getReviewStatus,
  getPendingReviews,
  concludeReview,
  getReviewHistory
};