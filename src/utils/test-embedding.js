/**
 * Embedding 测试脚本
 * 测试 NVIDIA Embedding API 并演示语义搜索效果
 */

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || 'YOUR_NVIDIA_API_KEY';

// 余弦相似度计算
function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (normA * normB);
}

// 生成 embedding
async function getEmbedding(text, model = 'nvidia/nv-embedqa-e5-v5') {
  const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: [text],
      model: model,
      encoding_format: 'float',
      input_type: 'query'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// 主测试函数
async function testEmbedding() {
  console.log('🧪 NVIDIA Embedding 测试\n');
  console.log('=' .repeat(60));

  // 测试 1: 基础功能
  console.log('\n📝 测试 1: 基础 Embedding 生成');
  console.log('-' .repeat(60));
  const texts = [
    "明天下午 3 点开会讨论项目进度",
    "修复登录页面的 bug",
    "购买咖啡和牛奶",
    "项目进度汇报会议",
    "修复用户登录问题"
  ];

  const embeddings = [];
  for (const text of texts) {
    const embedding = await getEmbedding(text);
    embeddings.push(embedding);
    console.log(`✓ "${text}" → ${embedding.length}维向量`);
  }

  // 测试 2: 语义相似度
  console.log('\n🔍 测试 2: 语义相似度计算');
  console.log('-' .repeat(60));
  
  // 比较 "开会" 相关的任务
  const queryEmbedding = await getEmbedding("明天开会");
  console.log('查询："明天开会"');
  console.log('\n与其他任务的相关性:');
  
  const testCases = [
    { text: "明天下午 3 点开会讨论项目进度", embedding: embeddings[0] },
    { text: "修复登录页面的 bug", embedding: embeddings[1] },
    { text: "购买咖啡和牛奶", embedding: embeddings[2] },
    { text: "项目进度汇报会议", embedding: embeddings[3] },
    { text: "修复用户登录问题", embedding: embeddings[4] }
  ];

  const similarities = testCases.map(tc => ({
    text: tc.text,
    similarity: cosineSimilarity(queryEmbedding, tc.embedding)
  }));

  // 按相似度排序
  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log('\n按相关性排序:');
  similarities.forEach((item, index) => {
    const bar = '█'.repeat(Math.round(item.similarity * 20));
    console.log(`${index + 1}. [${item.similarity.toFixed(3)}] ${bar.padEnd(20)} ${item.text}`);
  });

  // 测试 3: 不同模型对比
  console.log('\n\n📊 测试 3: 不同模型对比');
  console.log('-' .repeat(60));
  
  const models = [
    'nvidia/nv-embedqa-e5-v5',
    'nvidia/nv-embedqa-mistral-7b-v2',
    'nvidia/llama-3.2-nv-embedqa-1b-v2'
  ];

  const testText = "任务管理系统";
  console.log(`测试文本："${testText}"`);
  console.log('\n模型对比:');
  
  for (const model of models) {
    try {
      const start = Date.now();
      const embedding = await getEmbedding(testText, model);
      const duration = Date.now() - start;
      console.log(`✓ ${model.padEnd(40)} ${embedding.length}维 ${duration}ms`);
    } catch (error) {
      console.log(`✗ ${model.padEnd(40)} 错误：${error.message}`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ 测试完成!\n');
}

// 运行测试
testEmbedding().catch(console.error);
