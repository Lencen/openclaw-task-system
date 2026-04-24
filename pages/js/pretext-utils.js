/**
 * PreText 文本布局工具模块
 * 
 * 提供高性能的文本测量和布局计算，无需 DOM 操作
 * 
 * GitHub: https://github.com/chenglou/pretext
 */

// 如果通过 CDN 引入，使用全局变量
// 如果通过 npm 安装，使用 import
let pretextModule = null

// 尝试加载模块（支持多种引入方式）
async function loadPretext() {
  if (pretextModule) return pretextModule
  
  // 方式1: ES Module import
  try {
    pretextModule = await import('@chenglou/pretext')
    return pretextModule
  } catch (e) {
    // 方式2: 全局变量（CDN引入）
    if (window.pretext) {
      pretextModule = window.pretext
      return pretextModule
    }
    
    console.warn('PreText not loaded. Text measurement will use fallback.')
    return null
  }
}

// 预定义字体配置（与 CSS 同步）
const FONT_CONFIGS = {
  cardTitle: '600 14px Inter, sans-serif',
  cardDesc: '13px Inter, sans-serif',
  cardMeta: '12px Inter, sans-serif',
  docTitle: '600 14px Inter, sans-serif',
  docSummary: '13px Inter, sans-serif',
  logText: '12px Inter, sans-serif',
  tooltip: '12px Inter, sans-serif'
}

// 预定义行高（与 CSS 同步）
const LINE_HEIGHTS = {
  cardTitle: 20,
  cardDesc: 18,
  cardMeta: 16,
  docTitle: 20,
  docSummary: 18,
  logText: 16,
  tooltip: 14
}

// 缓存池
const measureCache = new Map()
const CACHE_MAX_SIZE = 1000

/**
 * 计算文本高度
 * @param {string} text - 文本内容
 * @param {string} configKey - 字体配置键名
 * @param {number} width - 容器宽度
 * @returns {Promise<number>} 文本高度
 */
export async function measureTextHeight(text, configKey = 'cardDesc', width = 300) {
  const module = await loadPretext()
  
  if (!module) {
    // Fallback: 使用估算值
    const avgCharWidth = configKey === 'cardTitle' ? 8 : 7
    const lineHeight = LINE_HEIGHTS[configKey] || 18
    const charsPerLine = Math.floor(width / avgCharWidth)
    const lines = Math.ceil(text.length / charsPerLine)
    return lines * lineHeight
  }
  
  const font = FONT_CONFIGS[configKey] || '13px Inter, sans-serif'
  const lineHeight = LINE_HEIGHTS[configKey] || 18
  
  // 检查缓存
  const cacheKey = `${text.substring(0, 50)}:${configKey}:${width}`
  if (measureCache.has(cacheKey)) {
    return measureCache.get(cacheKey)
  }
  
  // 使用 PreText 计算
  const { prepare, layout } = module
  const prepared = prepare(text, font)
  const { height } = layout(prepared, width, lineHeight)
  
  // 缓存结果
  if (measureCache.size < CACHE_MAX_SIZE) {
    measureCache.set(cacheKey, height)
  }
  
  return height
}

/**
 * 计算卡片高度（包含固定部分 + 动态文本）
 * @param {object} cardData - 卡片数据 { title, description }
 * @param {number} cardWidth - 卡片宽度
 * @param {number} maxLines - 描述最大行数
 * @returns {Promise<number>} 卡片总高度
 */
export async function measureCardHeight(cardData, cardWidth = 300, maxLines = 3) {
  const descHeight = await measureTextHeight(
    cardData.description || '',
    'cardDesc',
    cardWidth - 32  // 减去 padding
  )
  
  const lineHeight = LINE_HEIGHTS.cardDesc
  const maxDescHeight = maxLines * lineHeight
  
  // 卡片高度 = 头部(60) + 描述(动态) + meta(40) + padding(16)
  return 60 + Math.min(descHeight, maxDescHeight) + 40 + 16
}

/**
 * 批量计算卡片高度
 * @param {Array} cards - 卡片数据数组
 * @param {number} cardWidth - 卡片宽度
 * @returns {Promise<Array<number>>} 高度数组
 */
export async function measureCardHeights(cards, cardWidth = 300) {
  return Promise.all(cards.map(card => measureCardHeight(card, cardWidth)))
}

/**
 * 获取文本行信息（用于逐行渲染）
 * @param {string} text - 文本内容
 * @param {string} configKey - 字体配置键名
 * @param {number} width - 容器宽度
 * @returns {Promise<object>} { lines, height, lineCount }
 */
export async function getTextLines(text, configKey = 'cardDesc', width = 300) {
  const module = await loadPretext()
  
  if (!module) {
    // Fallback: 简单分割
    const height = await measureTextHeight(text, configKey, width)
    const lineHeight = LINE_HEIGHTS[configKey] || 18
    return {
      lines: [{ text, width }],
      height,
      lineCount: Math.ceil(height / lineHeight)
    }
  }
  
  const font = FONT_CONFIGS[configKey] || '13px Inter, sans-serif'
  const lineHeight = LINE_HEIGHTS[configKey] || 18
  
  const { prepareWithSegments, layoutWithLines } = module
  const prepared = prepareWithSegments(text, font)
  return layoutWithLines(prepared, width, lineHeight)
}

/**
 * 清除缓存（切换主题或字体时）
 */
export function clearMeasureCache() {
  measureCache.clear()
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  return {
    size: measureCache.size,
    maxSize: CACHE_MAX_SIZE
  }
}

// 导出字体配置，方便外部使用
export { FONT_CONFIGS, LINE_HEIGHTS }

/**
 * 全局初始化（页面加载时调用）
 */
export async function initPretext() {
  await loadPretext()
  console.log('PreText initialized')
}