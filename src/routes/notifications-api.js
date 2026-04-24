/**
 * Notification System API
 * Provides agents with notification sending and receiving capabilities
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();
const NOTIFICATIONS_FILE = path.join(__dirname, '../data/notifications.json');

/**
 * Generate a unique notification ID
 */
function generateNotificationId() {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `notif_${timestamp}_${randomStr}`;
}

/**
 * Read notifications from file
 */
function readNotifications() {
  try {
    if (!fs.existsSync(NOTIFICATIONS_FILE)) {
      return { notifications: [] };
    }
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Notifications API] Error reading notifications:', error);
    return { notifications: [] };
  }
}

/**
 * Save notifications to file
 */
function saveNotifications(data) {
  try {
    // Ensure the data directory exists
    const dataDir = path.dirname(NOTIFICATIONS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('[Notifications API] Error saving notifications:', error);
    return false;
  }
}

/**
 * GET /api/notifications
 * Get notifications list with filtering options
 * Query params:
 *   - agent: filter by agent ID (as recipient)
 *   - unreadOnly: if true, only return unread notifications
 *   - limit: max number of notifications to return (default: 50, max: 100)
 *   - offset: pagination offset (default: 0)
 */
router.get('/', (req, res) => {
  try {
    const { agent, unreadOnly, limit = 50, offset = 0 } = req.query;

    const data = readNotifications();
    let notifications = [...data.notifications];

    // Filter by recipient agent
    if (agent) {
      notifications = notifications.filter(n =>
        n.to === 'all' || n.to === agent
      );
    }

    // Filter unread only
    if (unreadOnly === 'true' || unreadOnly === true) {
      notifications = notifications.filter(n => !n.read);
    }

    // Sort by timestamp (newest first)
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Calculate pagination
    const total = notifications.length;
    const unreadCount = notifications.filter(n => !n.read).length;
    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    const paginatedNotifications = notifications.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      success: true,
      notifications: paginatedNotifications,
      pagination: {
        total,
        unreadCount,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < total
      }
    });
  } catch (error) {
    console.error('[Notifications API] Error getting notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/stats
 * Get notification statistics
 */
router.get('/stats', (req, res) => {
  try {
    const data = readNotifications();
    const notifications = data.notifications || [];

    // Calculate statistics
    const totalCount = notifications.length;
    const unreadCount = notifications.filter(n => !n.read).length;
    const readCount = totalCount - unreadCount;

    // Count by type
    const typeCounts = {};
    notifications.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    // Count by agent (as recipient)
    const agentCounts = {};
    notifications.forEach(n => {
      if (n.to !== 'all') {
        agentCounts[n.to] = (agentCounts[n.to] || 0) + 1;
      }
    });

    // Count by agent (as sender)
    const senderCounts = {};
    notifications.forEach(n => {
      senderCounts[n.from] = (senderCounts[n.from] || 0) + 1;
    });

    // Count by priority
    const priorityCounts = {};
    notifications.forEach(n => {
      priorityCounts[n.priority] = (priorityCounts[n.priority] || 0) + 1;
    });

    // Recent notifications (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCount = notifications.filter(n =>
      new Date(n.timestamp) >= sevenDaysAgo
    ).length;

    const stats = {
      totalCount,
      unreadCount,
      readCount,
      recentCount,
      typeDistribution: typeCounts,
      recipientDistribution: agentCounts,
      senderDistribution: senderCounts,
      priorityDistribution: priorityCounts
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[Notifications API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/unread-count/:agentId
 * Get unread notification count for a specific agent
 */
router.get('/unread-count/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;

    const data = readNotifications();
    const notifications = data.notifications || [];

    const unreadCount = notifications.filter(n =>
      !n.read && (n.to === 'all' || n.to === agentId)
    ).length;

    res.json({
      success: true,
      count: unreadCount
    });
  } catch (error) {
    console.error('[Notifications API] Error getting unread count:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/broadcasts/:agentId
 * Get broadcast history for an agent
 * Query params:
 *   - days: number of days to look back (default: 7)
 */
router.get('/broadcasts/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    const days = parseInt(req.query.days) || 7;

    const data = readNotifications();
    const notifications = data.notifications || [];

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const broadcasts = notifications.filter(n =>
      n.type === 'BROADCAST' &&
      new Date(n.timestamp) >= cutoffDate &&
      (n.to === 'all' || n.to === agentId)
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      broadcasts,
      total: broadcasts.length
    });
  } catch (error) {
    console.error('[Notifications API] Error getting broadcasts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/
 * Create and send a new notification
 */
router.post('/', (req, res) => {
  try {
    const { type, from, to, title, content, priority = 2 } = req.body;

    // Validate required fields
    if (!type || !from || !to || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, from, to, title'
      });
    }

    // Validate notification type
    const validTypes = [
      'TASK_ASSIGNED',
      'TASK_STARTED',
      'TASK_COMPLETED',
      'STEP_COMPLETED',
      'ISSUE_FOUND',
      'BROADCAST',
      'COMMUNICATION',
      'STATUS_UPDATE',
      'EMERGENCY',
      'INFO',
      'WARNING',
      'ERROR'
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid notification type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate priority (0 = highest, 3 = lowest)
    if (typeof priority !== 'number' || priority < 0 || priority > 3) {
      return res.status(400).json({
        success: false,
        error: 'Priority must be a number between 0 and 3'
      });
    }

    // Create notification object
    const notification = {
      id: generateNotificationId(),
      type,
      from,
      to,
      timestamp: new Date().toISOString(),
      title,
      content: content || {},
      priority: typeof priority === 'number' ? priority : 2,
      read: false,
      readAt: null
    };

    // Save notification
    const data = readNotifications();
    data.notifications.unshift(notification); // Add to beginning of array

    // Limit total notifications (keep last 1000)
    if (data.notifications.length > 1000) {
      data.notifications = data.notifications.slice(0, 1000);
    }

    if (saveNotifications(data)) {
      res.json({
        success: true,
        notification,
        message: 'Notification sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notification'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a specific notification as read
 */
router.put('/:id/read', (req, res) => {
  try {
    const { id } = req.params;

    const data = readNotifications();
    const notification = data.notifications.find(n => n.id === id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    if (notification.read) {
      return res.json({
        success: true,
        message: 'Notification already marked as read',
        notification
      });
    }

    notification.read = true;
    notification.readAt = new Date().toISOString();

    if (saveNotifications(data)) {
      res.json({
        success: true,
        notification,
        message: 'Notification marked as read'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notification'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for a specific agent
 * Body params:
 *   - agentId: the agent ID to mark notifications for
 */
router.put('/read-all', (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: agentId'
      });
    }

    const data = readNotifications();
    let markedCount = 0;

    data.notifications.forEach(notification => {
      // Only mark notifications for this agent (or broadcast to all)
      if (!notification.read && (notification.to === 'all' || notification.to === agentId)) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
        markedCount++;
      }
    });

    if (saveNotifications(data)) {
      res.json({
        success: true,
        count: markedCount,
        message: `Marked ${markedCount} notifications as read`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notifications'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/mark-all-read/:agentId
 * Alternative endpoint for marking all as read (used in tests)
 */
router.put('/mark-all-read/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;

    const data = readNotifications();
    let markedCount = 0;

    data.notifications.forEach(notification => {
      if (!notification.read && (notification.to === 'all' || notification.to === agentId)) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
        markedCount++;
      }
    });

    if (saveNotifications(data)) {
      res.json({
        success: true,
        count: markedCount,
        message: `Marked ${markedCount} notifications as read`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notifications'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const data = readNotifications();
    const index = data.notifications.findIndex(n => n.id === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    data.notifications.splice(index, 1);

    if (saveNotifications(data)) {
      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notifications'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/notifications/cleanup
 * Cleanup old notifications
 * Body params:
 *   - days: delete notifications older than this many days (default: 30)
 */
router.delete('/cleanup', (req, res) => {
  try {
    const { days = 30 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const data = readNotifications();
    const originalCount = data.notifications.length;

    data.notifications = data.notifications.filter(n =>
      new Date(n.timestamp) >= cutoffDate
    );

    const deletedCount = originalCount - data.notifications.length;

    if (saveNotifications(data)) {
      res.json({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} old notifications`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save notifications'
      });
    }
  } catch (error) {
    console.error('[Notifications API] Error cleaning up notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
