/**
 * Crypto Utils - 前端密码加密工具
 * 
 * 提供 SHA256 哈希功能，用于前端密码加密
 * 
 * 注意：使用纯 JS 实现，支持非 HTTPS 环境
 */

// SHA256 纯 JavaScript 实现
const Sha256 = (function() {
  // 错误处理
  const ERROR = 'input is invalid type';
  const WINDOW = typeof window === 'object';
  const root = WINDOW ? window : {};
  
  // 判断是否为 Array
  const isArray = Array.isArray || function(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };
  
  // 判断是否为 ArrayBuffer
  function isArrayBuffer(obj) {
    return Object.prototype.toString.call(obj) === '[object ArrayBuffer]';
  }
  
  // 判断是否为 ArrayBufferView
  function isArrayBufferView(obj) {
    return typeof ArrayBuffer === 'function' && ArrayBuffer.isView ? ArrayBuffer.isView(obj) : false;
  }
  
  // 转换为 32 位整数
  function safeAdd(x, y) {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }
  
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  
  function md4g1(x, a, b, c, d, k, s) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, x), safeAdd(k, s)), d), b);
  }
  
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  
  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }
  
  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }
  
  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  
  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t);
  }
  
  // SHA256 常量
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  
  // SHA256 辅助函数
  function sha256_ch(x, y, z) {
    return (x & y) ^ ((~x) & z);
  }
  
  function sha256_maj(x, y, z) {
    return (x & y) ^ (x & z) ^ (y & z);
  }
  
  function sha256_sigma0(x) {
    return bitRotateLeft(x, 2) ^ bitRotateLeft(x, 13) ^ bitRotateLeft(x, 22);
  }
  
  function sha256_sigma1(x) {
    return bitRotateLeft(x, 6) ^ bitRotateLeft(x, 11) ^ bitRotateLeft(x, 25);
  }
  
  function sha256_gamma0(x) {
    return bitRotateLeft(x, 7) ^ bitRotateLeft(x, 18) ^ (x >>> 3);
  }
  
  function sha256_gamma1(x) {
    return bitRotateLeft(x, 17) ^ bitRotateLeft(x, 19) ^ (x >>> 10);
  }
  
  // 将字符串转换为字节数组
  function utf8Encode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c < 0x10000) {
        bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      } else {
        bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return bytes;
  }
  
  // SHA256 主函数
  function sha256(bytes) {
    // 初始化哈希值
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    
    // 填充
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
      bytes.push(0);
    }
    
    // 添加长度（大端序）
    for (let i = 7; i >= 0; i--) {
      bytes.push((bitLen >>> (i * 8)) & 0xff);
    }
    
    // 处理每个 512 位块
    const w = new Array(64);
    for (let i = 0; i < bytes.length; i += 64) {
      // 准备消息调度
      for (let t = 0; t < 16; t++) {
        w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | 
               (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
      }
      for (let t = 16; t < 64; t++) {
        w[t] = safeAdd(safeAdd(safeAdd(sha256_gamma1(w[t - 2]), w[t - 7]), sha256_gamma0(w[t - 15])), w[t - 16]);
      }
      
      // 初始化工作变量
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      
      // 主循环
      for (let t = 0; t < 64; t++) {
        const t1 = safeAdd(safeAdd(safeAdd(safeAdd(h, sha256_sigma1(e)), sha256_ch(e, f, g)), K[t]), w[t]);
        const t2 = safeAdd(sha256_sigma0(a), sha256_maj(a, b, c));
        h = g;
        g = f;
        f = e;
        e = safeAdd(d, t1);
        d = c;
        c = b;
        b = a;
        a = safeAdd(t1, t2);
      }
      
      // 更新哈希值
      h0 = safeAdd(h0, a);
      h1 = safeAdd(h1, b);
      h2 = safeAdd(h2, c);
      h3 = safeAdd(h3, d);
      h4 = safeAdd(h4, e);
      h5 = safeAdd(h5, f);
      h6 = safeAdd(h6, g);
      h7 = safeAdd(h7, h);
    }
    
    // 输出结果（大端序）
    return [
      (h0 >>> 24) & 0xff, (h0 >>> 16) & 0xff, (h0 >>> 8) & 0xff, h0 & 0xff,
      (h1 >>> 24) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff,
      (h2 >>> 24) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff,
      (h3 >>> 24) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 8) & 0xff, h3 & 0xff,
      (h4 >>> 24) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 8) & 0xff, h4 & 0xff,
      (h5 >>> 24) & 0xff, (h5 >>> 16) & 0xff, (h5 >>> 8) & 0xff, h5 & 0xff,
      (h6 >>> 24) & 0xff, (h6 >>> 16) & 0xff, (h6 >>> 8) & 0xff, h6 & 0xff,
      (h7 >>> 24) & 0xff, (h7 >>> 16) & 0xff, (h7 >>> 8) & 0xff, h7 & 0xff
    ];
  }
  
  // 字节数组转十六进制字符串
  function bytesToHex(bytes) {
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  return {
    hash: function(message) {
      const bytes = utf8Encode(String(message));
      const hashBytes = sha256(bytes.slice());
      return bytesToHex(hashBytes);
    }
  };
})();

// 导出 CryptoUtils
const CryptoUtils = {
  /**
   * SHA256 哈希
   * @param {string} message - 要哈希的消息
   * @returns {Promise<string>} - 十六进制格式的哈希值
   */
  async sha256(message) {
    // 使用纯 JS 实现（支持非 HTTPS 环境）
    return Promise.resolve(Sha256.hash(message));
  },
  
  /**
   * SHA256 哈希 (Base64 格式)
   * @param {string} message - 要哈希的消息
   * @returns {Promise<string>} - Base64 格式的哈希值
   */
  async sha256Base64(message) {
    const hex = Sha256.hash(message);
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return btoa(String.fromCharCode.apply(null, bytes));
  },
  
  /**
   * 生成随机字符串
   * @param {number} length - 长度
   * @returns {string} - 随机字符串
   */
  randomString(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint32Array(length);
    // 使用 crypto.getRandomValues（即使在非 HTTPS 环境下也可用）
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomValues);
    } else {
      // 回退到 Math.random
      for (let i = 0; i < length; i++) {
        randomValues[i] = Math.floor(Math.random() * 0xFFFFFFFF);
      }
    }
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
    }
    return result;
  },
  
  /**
   * 验证 SHA256 哈希格式
   * @param {string} hash - 要验证的哈希值
   * @returns {boolean} - 是否为有效的 SHA256 哈希
   */
  isValidSha256(hash) {
    return /^[a-fA-F0-9]{64}$/.test(hash);
  }
};

// 如果在 Node.js 环境，导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoUtils;
}