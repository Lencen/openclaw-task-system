/**
 * 方案评审 API 路由
 */

const express = require('express');
const router = express.Router();
const reviewMiddleware = require('../middleware/review-middleware');

/**
 * POST /api/review/create
 * 创建评审请求
 */
router.post('/create', (req, res) => {
  const { proposal, reviewers, timeout } = req.body;
  
  if (!proposal || !proposal.title || !proposal.content) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '缺少方案信息' }
    });
  }
  
  if (!reviewers || !Array.isArray(reviewers) || reviewers.length === 0) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '缺少评审人列表' }
    });
  }
  
  const result = reviewMiddleware.createReview(proposal, reviewers, timeout);
  
  res.json({
    code: 200,
    data: result
  });
});

/**
 * POST /api/review/vote
 * 提交评审投票
 */
router.post('/vote', (req, res) => {
  const { reviewId, agentId, vote, score, comment } = req.body;
  
  if (!reviewId || !agentId || !vote) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '缺少必填字段' }
    });
  }
  
  if (!['approve', 'reject', 'abstain'].includes(vote)) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '无效的投票值' }
    });
  }
  
  const result = reviewMiddleware.submitVote(reviewId, agentId, vote, score, comment);
  
  if (result.error) {
    return res.status(result.code).json({
      code: result.code,
      error: { type: 'ReviewError', message: result.error }
    });
  }
  
  res.json({
    code: 200,
    data: result
  });
});

/**
 * GET /api/review/:id
 * 获取评审状态
 */
router.get('/:id', (req, res) => {
  const { id: reviewId } = req.params;
  
  const result = reviewMiddleware.getReviewStatus(reviewId);
  
  if (result.error) {
    return res.status(result.code).json({
      code: result.code,
      error: { type: 'ReviewError', message: result.error }
    });
  }
  
  res.json({
    code: 200,
    data: result
  });
});

/**
 * GET /api/review/pending
 * 获取待处理的评审列表
 */
router.get('/pending/list', (req, res) => {
  const agentId = req.query.agentId || null;
  
  const reviews = reviewMiddleware.getPendingReviews(agentId);
  
  res.json({
    code: 200,
    data: {
      reviews,
      total: reviews.length
    }
  });
});

/**
 * POST /api/review/:id/conclude
 * 结束评审（强制）
 */
router.post('/:id/conclude', (req, res) => {
  const { id: reviewId } = req.params;
  const { decision, reason } = req.body;
  
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({
      code: 400,
      error: { type: 'ValidationError', message: '无效的决定' }
    });
  }
  
  const result = reviewMiddleware.concludeReview(reviewId, decision, reason);
  
  if (result.error) {
    return res.status(result.code).json({
      code: result.code,
      error: { type: 'ReviewError', message: result.error }
    });
  }
  
  res.json({
    code: 200,
    data: result
  });
});

/**
 * GET /api/review/history
 * 获取评审历史
 */
router.get('/history/list', (req, res) => {
  const proposalType = req.query.type || null;
  const limit = parseInt(req.query.limit) || 20;
  
  const history = reviewMiddleware.getReviewHistory(proposalType, limit);
  
  res.json({
    code: 200,
    data: {
      reviews: history,
      total: history.length
    }
  });
});

module.exports = router;