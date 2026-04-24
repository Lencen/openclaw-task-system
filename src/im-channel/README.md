# IM 渠道扩展模块

## 概述

本模块融合了 `chatgpt-on-wechat` 和 `cherry-studio` 的核心能力，提供统一的 IM 渠道接口。

### 核心能力

1. **微信通道实现** - 基于 chatgpt-on-wechat
2. **钉钉通道实现** - 基于 cherry-studio Provider Factory
3. **Token 自动刷新机制** - 统一的 Token 管理
4. **文件缓存机制** - Media 文件缓存管理
5. **Provider Factory 统一 LLM 接口** - 多 LLM 提供商支持

## 目录结构

```
src/im-channel/
├── README.md                    # 本文件
├── index.js                     # 主入口，导出所有模块
├── provider-factory/
│   ├── index.js                 # Provider Factory 主类
│   └── channel-provider.js      # 渠道提供商基类
├── channels/
│   ├── index.js                 # 渠道注册中心
│   ├── base-channel.js          # 渠道基类
│   ├── wechat-channel.js        # 微信通道实现
│   └── dingtalk-channel.js      # 钉钉通道实现
├── token-manager/
│   ├── index.js                 # Token 管理器
│   ├── abstract-token-manager.js # 抽象 Token 管理器
│   ├── wechat-token-manager.js  # 微信 Token 管理
│   └── dingtalk-token-manager.js # 钉钉 Token 管理
├── media-cache/
│   ├── index.js                 # 媒体缓存管理
│   └── base-cache-manager.js    # 缓存管理基类
└── utils/
    ├── signature-validator.js   # 签名验证
    └── message-parser.js        # 消息解析器
```

## 核心设计

### 1. Provider Factory

统一的 LLM 接口管理，支持多提供商：

```javascript
const factory = new ProviderFactory();
const provider = factory.getProviderForChannel('wechat');
const result = await provider.generate(messages);
```

### 2. 通道抽象

所有 IM 渠道继承自基类：

```javascript
class WechatChannel extends BaseChannel {
  constructor(config, providerFactory) {
    super(config, providerFactory);
  }
  
  async startup() { /* 初始化 */ }
  async handleMessage(message) { /* 处理消息 */ }
  async sendText(toChatId, content) { /* 发送文本 */ }
}
```

### 3. Token 自动刷新

统一的 Token 管理，支持各平台刷新机制：

```javascript
const tokenManager = new WechatTokenManager(config);
const token = await tokenManager.getValidToken();
```

## 使用示例

### 初始化

```javascript
const IMChannelFactory = require('./src/im-channel');
const providerFactory = new IMChannelFactory.ProviderFactory();
const channelManager = new IMChannelFactory.ChannelManager();

// 加载通道
await channelManager.loadChannel('wechat', config);
await channelManager.loadChannel('dingtalk', config);
```

### 处理消息

```javascript
const channel = channelManager.getChannel('wechat');
const message = channel.parseMessage(payload);
await channel.handleMessage(message);
```

## 状态

- [x] 基础架构设计
- [x] Provider Factory 实现
- [x] Channel 基类实现
- [x] 钉钉通道实现
- [ ] 微信通道实现
- [ ] Token 管理器统一实现
- [ ] 媒体缓存管理
- [ ] 签名验证工具
- [ ] 消息解析器
- [ ] API 路由集成
- [ ] 测试用例
