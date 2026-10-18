// ─── AI Reply (chửi bằng AI) ──────────────────────────────────────────────────
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const _client = new OpenAI({
  baseURL: 'https://api.xkiro.com/v1',
  apiKey:  'sk-xt-f18169b5ebfbe57030c467d0efc92858e4e2bd1395d1fc20',
});

// Danh sách các model hỗ trợ
const MODELS = [
  'qwen/qwen3.7-flash:free',
  'qwen/qwen3.5-flash:free',
  'minimax/minimax-m2.7-highspeed:free'
];

// Danh sách câu chửi dự phòng từ nhaydai.txt
const NHAY_PATHS = [
  path.join(__dirname, '..', '..', 'nhaydai.txt'),
  path.join(__dirname, '..', '..', 'asset', 'nhaydai.txt'),
];

let cachedNhayLines = null;
function getRandomNhayLine() {
  if (!cachedNhayLines) {
    for (const p of NHAY_PATHS) {
      if (fs.existsSync(p)) {
        cachedNhayLines = fs.readFileSync(p, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        break;
      }
    }
  }
  if (cachedNhayLines && cachedNhayLines.length > 0) {
    const idx = Math.floor(Math.random() * cachedNhayLines.length);
    return cachedNhayLines[idx];
  }
  return 'đụ má m con chó ngu =)))';
}

const HARD_PREFIXES = [
  'đụ má m,',
  'đụ mẹ mày nha tk cặc ngu,',
  'cái lồn mẹ mày,',
  'não cặc à tk đĩ,',
  'con chó não lồn,',
  'ê tk cặc ngu,',
  'đụ má m con chó ngu,',
  'cái tk đĩ não tàn,'
];

const HARD_SUFFIXES = [
  'đụ má m =)))',
  'tk óc cặc =)))',
  'con chó ngu =)))',
  'dkm =)))',
  'não lồn =)))',
  '=)))'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Gọi AI để sinh câu chửi dựa trên nội dung tin nhắn của mục tiêu.
 * Kết hợp mỉa mai xoáy sâu nội dung của AI + các từ ngữ cực mạnh đụ má, đụ mẹ, não cặc chuẩn nhaydai.txt.
 * @param {string} userMessage - Nội dung tin nhắn mà target vừa gửi
 * @returns {Promise<string>} - Câu trả lời của AI
 */
async function getAIReply(userMessage) {
  for (const model of MODELS) {
    try {
      const response = await _client.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: `Người ta vừa nói: "${userMessage}".
Viết 1 câu duy nhất dưới 10 từ cực kỳ cay cú, xéo xắt, chửi dằn mặt thẳng vào câu đó (xưng tao - mày, tuyệt đối không dài dòng):`
          },
        ],
        max_tokens: 35,
      });

      let reply = response.choices[0]?.message?.content?.trim();
      if (reply) {
        // Lọc bỏ nếu model từ chối trả lời
        if (
          reply.includes('không thể') ||
          reply.includes('từ ngữ') ||
          reply.includes('quy tắc') ||
          reply.includes('I cannot')
        ) {
          continue;
        }

        // Bỏ dấu ngoặc kép bọc ngoài nếu có
        reply = reply.replace(/^["'“”]|["'“”]$/g, '').trim();

        // Biến chữ cái đầu thành chữ thường để ghép với tiền tố
        if (reply.length > 0) {
          reply = reply.charAt(0).toLowerCase() + reply.slice(1);
        }

        // Ghép đụ má / đụ mẹ / não cặc ở đầu và đuôi
        const prefix = getRandomItem(HARD_PREFIXES);
        const suffix = getRandomItem(HARD_SUFFIXES);

        return `${prefix} ${reply} ${suffix}`;
      }
    } catch (err) {
      continue;
    }
  }

  // Fallback nếu AI lỗi mạng
  const line1 = getRandomNhayLine();
  return line1;
}

module.exports = { getAIReply };
