const fs   = require('fs');
const path = require('path');
const { getAIReply } = require('./ai');

const NHAY_PATHS = [
  path.join(__dirname, '..', '..', 'nhaydai.txt'),
  path.join(__dirname, '..', '..', 'asset', 'nhaydai.txt'),
];

// ─── Đa tab Nhây (Multi-channel Nhây sessions) ───────────────────────────────
// Map: channelId -> { isRunning: boolean }
const _nhaySessions = new Map();

// ─── Watch user (AI Reply): channelId -> { userId, listener } ─────────────────
const _watchSessions = new Map();

function getFilePath(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

/**
 * Đọc file txt, trả về mảng các dòng không rỗng.
 */
function readLines(filePaths) {
  const fp = getFilePath(filePaths);
  if (!fs.existsSync(fp)) return [];
  return fs.readFileSync(fp, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// ─── Watch session (AI Reply khi user nhắn tin) ───────────────────────────────

function startWatch(client, channelId, userId) {
  stopWatch(client, channelId);

  const listener = async (msg) => {
    if (msg.channel.id !== channelId) return;
    if (msg.author.id !== userId) return;

    const text = msg.content?.trim();
    if (!text) return;

    try {
      msg.channel.sendTyping().catch(() => {});
      const aiReply = await getAIReply(text);
      await msg.reply(aiReply);
    } catch (e) {
      console.error('[Watch] Lỗi AI reply:', e.message);
    }
  };

  client.on('messageCreate', listener);
  _watchSessions.set(channelId, { userId, listener, client });
}

function stopWatch(client, channelId) {
  const session = _watchSessions.get(channelId);
  if (session) {
    const targetClient = session.client || client;
    if (targetClient && targetClient.off) {
      targetClient.off('messageCreate', session.listener);
    }
    _watchSessions.delete(channelId);
  }
}

function stopAllWatch(client) {
  for (const channelId of _watchSessions.keys()) {
    stopWatch(client, channelId);
  }
}

// ─── Nhây (Đa tab: mỗi channel có thể chạy nhây độc lập) ─────────────────────

/**
 * Dừng quá trình gửi nhây ở 1 channel cụ thể.
 * @param {string} channelId
 */
function stopNhay(channelId) {
  const session = _nhaySessions.get(channelId);
  if (session) {
    session.isRunning = false;
    _nhaySessions.delete(channelId);
    return true;
  }
  return false;
}

/**
 * Dừng nhây trên toàn bộ các channel.
 */
function stopAllNhay() {
  for (const [channelId, session] of _nhaySessions.entries()) {
    session.isRunning = false;
  }
  _nhaySessions.clear();
}

/**
 * Chỉ nhay: gửi từng dòng nhaydai.txt kèm tag user (chạy đa tab).
 * @param {import('discord.js-selfbot-v13').TextBasedChannels} channel
 * @param {string} [tag]
 */
async function sendNhay(channel, tag = '') {
  const channelId = channel.id;

  if (_nhaySessions.has(channelId)) {
    return {
      success: false,
      error: 'Kênh này đang chạy nhây rồi! Bạn có thể gõ `stop` để dừng.',
    };
  }

  const filePath = getFilePath(NHAY_PATHS);
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `Không tìm thấy file nhaydai.txt tại: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return { success: false, error: 'File nhaydai.txt đang trống.' };

  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { success: false, error: 'File nhaydai.txt không có nội dung nào.' };

  const session = { isRunning: true };
  _nhaySessions.set(channelId, session);

  const tagPrefix = tag ? `${tag} ` : '';

  try {
    for (let i = 0; i < lines.length; i++) {
      if (!session.isRunning) break;

      await channel.sendTyping().catch(() => {});

      const rawText = tagPrefix ? `${tagPrefix}${lines[i]}` : lines[i];
      const messageToSend = rawText.startsWith('#') ? rawText : `# ${rawText}`;
      const sentMsg = await channel.send(messageToSend).catch((err) => {
        console.error('[Nhay] Lỗi gửi tin nhắn:', err.message);
        return null;
      });

      // Đợi 2 giây sau khi gửi tin nhắn
      for (let s = 0; s < 20 && session.isRunning; ++s) {
        await new Promise((r) => setTimeout(r, 100));
      }

      // Tự động xóa tin nhắn đã gửi sau 2 giây để gửi tin nhắn tiếp theo
      if (sentMsg) {
        await sentMsg.delete().catch(() => {});
      }

      if (!session.isRunning) break;
    }
  } finally {
    _nhaySessions.delete(channelId);
  }

  return { success: true, count: lines.length };
}

/**
 * Nhay RL: CHỈ bật AI theo dõi @user. Khi user đó nhắn tin → AI reply chửi.
 * KHÔNG gửi tin nhắn từ file nhaydai.txt.
 * @param {import('discord.js-selfbot-v13').TextBasedChannels} channel
 * @param {string} tag
 * @param {import('discord.js-selfbot-v13').Client} client
 */
async function sendNhayRL(channel, tag, client) {
  if (!tag || !client) {
    return {
      success: false,
      error: 'Vui lòng tag người dùng cần theo dõi. Ví dụ: `nhay rl @user`',
    };
  }

  const idMatch = tag.match(/\d{17,20}/);
  if (!idMatch) {
    return {
      success: false,
      error: 'Không tìm thấy ID người dùng hợp lệ để theo dõi.',
    };
  }

  startWatch(client, channel.id, idMatch[0]);
  return { success: true };
}

module.exports = {
  sendNhay,
  sendNhayRL,
  stopNhay,
  stopAllNhay,
  stopWatch,
  stopAllWatch,
  getFilePath: () => getFilePath(NHAY_PATHS),
};
