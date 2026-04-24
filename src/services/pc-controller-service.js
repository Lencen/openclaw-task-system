/**
 * Agent PC 控制服务
 * 
 * 功能：
 * 1. 屏幕截图
 * 2. 鼠标控制（移动、点击、滚动）
 * 3. 键盘控制（按键、输入文字）
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

// 配置
const CONFIG = {
  screenshotDir: path.join(__dirname, '../data/screenshots'),
  defaultTimeout: 5000
};

// 确保截图目录存在
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

class PCControllerService {
  constructor() {
    this.platform = process.platform;
    this.screenshotCounter = 0;
  }

  /**
   * 屏幕截图
   */
  async screenshot(options = {}) {
    try {
      const filename = `screenshot_${Date.now()}_${this.screenshotCounter++}.png`;
      const filepath = path.join(CONFIG.screenshotDir, filename);

      // 使用 Python + PIL 截图（跨平台）
      const pythonScript = `
import pyautogui
screenshot = pyautogui.screenshot()
screenshot.save('${filepath}')
print('OK')
`;
      
      await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });

      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        return {
          success: true,
          filepath: filepath,
          filename: filename,
          size: stats.size,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('截图文件未生成');
      }
    } catch (error) {
      console.error('[PCController] 截图失败:', error);
      return {
        success: false,
        error: error.message,
        note: '需要安装: pip install pyautogui'
      };
    }
  }

  /**
   * 移动鼠标
   */
  async moveMouse(x, y) {
    try {
      const pythonScript = `
import pyautogui
pyautogui.moveTo(${x}, ${y})
print('OK')
`;
      await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      return { success: true, x, y, action: 'move' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 鼠标点击
   */
  async click(x, y, button = 'left') {
    try {
      const pythonScript = `
import pyautogui
pyautogui.click(${x}, ${y}, button='${button}')
print('OK')
`;
      await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      return { success: true, x, y, button, action: 'click' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 输入文字
   */
  async typeText(text) {
    try {
      // 使用单引号避免转义问题
      const escapedText = text.replace(/'/g, "\\'");
      const pythonScript = `import pyautogui; pyautogui.typewrite('${escapedText}', interval=0.01)`;
      await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      return { success: true, text, action: 'type' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 按键
   */
  async keyPress(keys) {
    try {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const keyStr = keyArray.join("','");
      
      const pythonScript = `
import pyautogui
pyautogui.keyDown('${keyStr}')
pyautogui.keyUp('${keyStr}')
print('OK')
`;
      await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      return { success: true, keys: keyArray, action: 'keypress' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取屏幕尺寸
   */
  async getScreenSize() {
    try {
      const pythonScript = `
import pyautogui
width, height = pyautogui.size()
print(f"{width},{height}")
`;
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      const [width, height] = stdout.trim().split(',').map(Number);
      
      return { success: true, width, height, platform: this.platform };
    } catch (error) {
      // 返回默认值
      return { success: true, width: 1920, height: 1080, platform: this.platform, note: '使用默认值' };
    }
  }

  /**
   * 获取鼠标位置
   */
  async getMousePosition() {
    try {
      const pythonScript = 'import pyautogui; x, y = pyautogui.position(); print(str(x)+","+str(y))';
      const { stdout } = await execPromise(`python3 -c "${pythonScript}"`, { timeout: CONFIG.defaultTimeout });
      const [x, y] = stdout.trim().split(',').map(Number);
      
      return { success: true, x, y };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = PCControllerService;