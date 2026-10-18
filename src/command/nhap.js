// ─── Nhap (Typing Indicator) — Per-Server ─────────────────────────────────────
// Mỗi server (guild) được quản lý độc lập.
// Bật: startNhap(channel)      → nhap liên tục tại channel của server đó
// Tắt: stopNhap(guildId)       → dừng nhap server đó
// Tắt hết: stopAllNhap()       → dừng toàn bộ

// Map: guildId → { channel, interval }
const _sessions = new Map();

/**
 * Bắt đầu nhap tại channel của một server.
 * Nếu server đó đang nhap ở kênh khác → chuyển sang kênh mới.
 * @param {import('discord.js').TextChannel} channel
 */
function startNhap(channel) {
  const guildId = channel.guild?.id ?? channel.id; // DM fallback = channelId

  // Dừng session cũ của server này nếu có
  _stopSession(guildId);

  // Discord typing indicator tự hết sau ~10s, gửi lại mỗi 8s
  const send = () => channel.sendTyping().catch(() => {});
  send(); // gửi ngay
  const interval = setInterval(send, 8000);

  _sessions.set(guildId, { channel, interval });
}

/**
 * Dừng nhap của một server cụ thể.
 * @param {string} guildId
 */
function stopNhap(guildId) {
  _stopSession(guildId);
}

/**
 * Dừng toàn bộ nhap ở tất cả server.
 */
function stopAllNhap() {
  for (const guildId of _sessions.keys()) {
    _stopSession(guildId);
  }
}

/**
 * Kiểm tra server có đang nhap không.
 * @param {string} guildId
 * @returns {boolean}
 */
function isNhapActive(guildId) {
  return _sessions.has(guildId);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _stopSession(guildId) {
  const session = _sessions.get(guildId);
  if (session) {
    clearInterval(session.interval);
    _sessions.delete(guildId);
  }
}

module.exports = { startNhap, stopNhap, stopAllNhap, isNhapActive };
