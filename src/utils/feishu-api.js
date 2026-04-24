/**
 * 飞书API工具类
 *
 * 功能:
 * - 文档创建/更新/删除
 * - 知识库节点操作
 * - DocX块格式操作
 */

const https = require('https');
const querystring = require('querystring');

// 配置
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

class FeishuAPI {
  constructor(appId, appSecret) {
    this.appId = appId || FEISHU_APP_ID;
    this.appSecret = appSecret || FEISHU_APP_SECRET;
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  // 获取访问令牌
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    const options = {
      method: 'POST',
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const data = JSON.stringify({
      app_id: this.appId,
      app_secret: this.appSecret
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.code === 0) {
              this.accessToken = response.tenant_access_token;
              this.tokenExpireTime = Date.now() + (response.expire - 60) * 1000;
              resolve(this.accessToken);
            } else {
              reject(new Error(`获取Token失败: ${response.msg}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // 发起API请求
  async request(method, path, data = null) {
    const accessToken = await this.getAccessToken();

    const options = {
      method,
      hostname: 'open.feishu.cn',
      path: `${FEISHU_API_BASE}${path}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.code === 0) {
              resolve(response.data);
            } else {
              reject(new Error(`API错误: ${response.msg} (code: ${response.code})`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // 创建知识库文档
  async createDocument(options) {
    const { spaceId, parentToken, title, content } = options;

    // 先创建节点
    const node = await this.request('POST', '/docx/v1/documents', {
      title: title || 'Untitled'
    });

    const docToken = node.document.document_id;

    // 更新文档内容
    if (content) {
      await this.updateDocument(docToken, { content });
    }

    return {
      docToken,
      nodeId: docToken
    };
  }

  // 更新文档内容
  async updateDocument(docToken, options = {}) {
    const { content, blocks } = options;

    let blockData = blocks;

    // 如果提供的是简单的文本内容，转换为块格式
    if (content && !blocks) {
      blockData = [
        {
          block_type: 1, // text
          paragraph: {
            elements: [
              {
                text_run: {
                  content: content
                }
              }
            ]
          }
        }
      ];
    }

    // 获取文档块
    const blocksRes = await this.request('GET', `/docx/v1/documents/${docToken}/blocks/${docToken}/children`);
    const blockId = blocksRes.items[0]?.block_id || docToken;

    // 批量创建块
    if (blockData && blockData.length > 0) {
      await this.request('POST', `/docx/v1/documents/${docToken}/blocks/${blockId}/children`, {
        children: blockData,
        index: -1
      });
    }

    return { success: true, docToken };
  }

  // 获取文档内容
  async getDocument(docToken) {
    // 获取文档信息
    const docInfo = await this.request('GET', `/docx/v1/documents/${docToken}`);

    // 获取文档块
    const blocksRes = await this.request('GET', `/docx/v1/documents/${docToken}/blocks/${docToken}/children`);

    let content = '';
    for (const block of blocksRes.items || []) {
      if (block.paragraph?.elements) {
        for (const element of block.paragraph.elements) {
          if (element.text_run) {
            content += element.text_run.content + '\n';
          }
        }
      }
    }

    return {
      title: docInfo.document.title,
      content: content.trim(),
      docToken
    };
  }

  // 获取知识库节点列表
  async listNodes(spaceId, parentToken = '') {
    const params = {
      page_size: 50,
      parent_node_token: parentToken
    };

    return await this.request('GET', `/wiki/v2/spaces/${spaceId}/nodes?${querystring.stringify(params)}`);
  }

  // 获取文件上传信息
  async getUploadUpload(parentToken, size, name) {
    return await this.request('POST', '/drive/v1/medias/upload_all', {
      parent_type: 'explorer',
      parent_node: parentToken,
      size: size,
      name: name
    });
  }

  // 删除文档
  async deleteDocument(docToken) {
    return await this.request('DELETE', `/docx/v1/documents/${docToken}`);
  }
}

module.exports = FeishuAPI;
