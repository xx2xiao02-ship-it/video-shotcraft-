// 视频外包装 - 规则式候选标题生成（纯函数，无 IO、无网络）。
// AI 增强通道见 packaging-ai.mjs；两侧输出结构一致：{text, pattern, length, fitsLimit}。
export const PLATFORM_LIMITS = {douyin:20, shipinhao:20, xiaohongshu:20, bilibili:40, general:30};

const ADJECTIVES = ['有效', '实用', '简单', '高效', '省心', '惊艳'];
const AUDIENCES = ['新手', '入门者', '内容创作者', '打工人', '小白'];

function pick(list, seed) {
  return list[Math.abs(seed) % list.length];
}

export function generateTitles({topic, keywords = [], platform = 'general', count = 8} = {}) {
  const subject = String(topic || '').trim() || '这个主题';
  const keywordList = (Array.isArray(keywords) ? keywords : []).map(item => String(item).trim()).filter(Boolean);
  const keyword = keywordList[0] || subject;
  const limit = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.general;
  // 超长主题缩略，保证任何主题都有能落进平台字数限制的短标题
  const shortSubject = subject.length > 10 ? `${subject.slice(0, 9)}…` : subject;
  const shortKeyword = keyword.length > 8 ? `${keyword.slice(0, 7)}…` : keyword;
  const patterns = [
    {pattern:'number', text:`${3 + (subject.length % 5)} 个${keyword}技巧，最后一个最${pick(ADJECTIVES, subject.length)}`},
    {pattern:'question', text:`${subject}真的值得做吗？3 分钟说清楚`},
    {pattern:'suspense', text:`别再乱做了，${subject}的正确姿势是这样的`},
    {pattern:'contrast', text:`同样的${keyword}，为什么别人的效果差这么多？`},
    {pattern:'short-question', text:`${shortKeyword}怎么选？一条视频讲透`},
    {pattern:'short-enough', text:`${shortSubject}，看这篇就够了`},
    {pattern:'short-guide', text:`一句话讲透${shortKeyword}`},
    {pattern:'benefit', text:`学会这一招，${subject}效率翻倍`},
    {pattern:'audience', text:`写给${pick(AUDIENCES, keywordList.length)}的${subject}入门指南`},
    {pattern:'suspense2', text:`关于${subject}，90% 的人都忽略了这点`},
    {pattern:'number2', text:`${subject}避坑指南：这 5 个坑我替你踩过了`},
    {pattern:'benefit2', text:`一次搞懂${keyword}，少走两年弯路`},
    {pattern:'contrast2', text:`${subject}：普通玩法 vs 高手玩法`},
  ];
  const seen = new Set();
  const result = [];
  for (const item of patterns) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({text, pattern:item.pattern, length:text.length, fitsLimit:text.length <= limit});
    if (result.length >= count) break;
  }
  return result;
}
