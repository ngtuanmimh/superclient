/**
 * Module xử lý StreamRPC (Rich Presence - Streaming) cho Selfbot Discord.
 * Hỗ trợ Fake Time (thời gian đã trôi qua đếm tự nhiên) và hiển thị ảnh/GIF động từ Discord CDN.
 */

/**
 * Chuyển đổi link ảnh (Discord CDN / Media Proxy) sang định dạng 'mp:attachments/...' chuẩn của Discord.
 * Discord Client yêu cầu định dạng này để hiển thị ảnh lớn / ảnh nhỏ / GIF động trên profile Presence.
 *
 * @param {string} url
 * @returns {string|null}
 */
function parseAssetImage(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('mp:') || trimmed.startsWith('external/')) {
    return trimmed.startsWith('mp:') ? trimmed : `mp:${trimmed}`;
  }

  // Thay thế cdn.discordapp.com hoặc media.discordapp.net thành mp:
  if (trimmed.startsWith('https://cdn.discordapp.com/')) {
    return trimmed.replace('https://cdn.discordapp.com/', 'mp:');
  }
  if (trimmed.startsWith('http://cdn.discordapp.com/')) {
    return trimmed.replace('http://cdn.discordapp.com/', 'mp:');
  }
  if (trimmed.startsWith('https://media.discordapp.net/')) {
    return trimmed.replace('https://media.discordapp.net/', 'mp:');
  }
  if (trimmed.startsWith('http://media.discordapp.net/')) {
    return trimmed.replace('http://media.discordapp.net/', 'mp:');
  }

  return trimmed;
}

let cachedFakeStartTimestamp = null;

/**
 * Lấy fake start timestamp cố định để timer trên Discord đếm tăng dần tự nhiên,
 * không bị reset ngược lại mỗi khi gửi heartbeat keep-alive.
 *
 * @param {object} [config={}]
 * @returns {number}
 */
function getFakeStartTimestamp(config = {}) {
  if (typeof config.fakeStartTime === 'number') {
    return config.fakeStartTime;
  }
  if (typeof config.startTimestamp === 'number') {
    return config.startTimestamp;
  }

  if (!cachedFakeStartTimestamp) {
    const fakeHours = typeof config.fakeHours === 'number' ? config.fakeHours : 100;
    cachedFakeStartTimestamp = Date.now() - (fakeHours * 60 * 60 * 1000);
  }
  return cachedFakeStartTimestamp;
}

/**
 * Reset lại fake start timestamp nếu muốn đặt thời gian mới.
 * @param {number|null} [timestamp=null]
 */
function resetFakeStartTime(timestamp = null) {
  cachedFakeStartTimestamp = timestamp;
}

/**
 * Xây dựng activity object cho STREAMING RPC để gắn vào Presence (Gateway OP 3).
 *
 * @param {{
 *   streamName?: string,
 *   avatarUrl?: string,
 *   imageUrl?: string,
 *   twitchUrl?: string,
 *   details?: string,
 *   state?: string,
 *   fakeHours?: number,
 *   fakeStartTime?: number,
 *   startTimestamp?: number,
 *   applicationId?: string
 * }} config
 * @returns {object}
 */
function buildStreamActivity(config = {}) {
  const streamName = config.streamName || 'Live Stream';
  const twitchUrl  = config.twitchUrl || 'https://twitch.tv/yourchannel';
  const rawImageUrl = config.avatarUrl || config.imageUrl || '';
  const parsedImage = parseAssetImage(rawImageUrl);
  const fakeStart   = getFakeStartTimestamp(config);

  const elapsedHours = Math.round((Date.now() - fakeStart) / 3600000);

  console.log('[StreamRPC] Activity built:');
  console.log(`  Stream name : ${streamName}`);
  console.log(`  Twitch URL  : ${twitchUrl}`);
  console.log(`  Image URL   : ${rawImageUrl || '(none)'}`);
  console.log(`  Asset image : ${parsedImage || '(none)'}`);
  console.log(`  Fake start  : ${new Date(fakeStart).toISOString()} (~${elapsedHours}h ago)`);

  const activity = {
    name: streamName,
    type: 1, // 1 = STREAMING (chuẩn numeric cho Gateway Opcode 3 & selfbot)
    url: twitchUrl,
    // Gateway Opcode 3 yêu cầu timestamps.start để hiển thị bộ đếm thời gian (Fake Time)
    timestamps: {
      start: fakeStart,
    },
    startTimestamp: fakeStart, // Dự phòng cho các wrapper đọc startTimestamp
  };

  if (config.applicationId) {
    activity.application_id = config.applicationId;
  }

  // Gắn assets hình ảnh (chỉ large_image) nếu có URL
  if (parsedImage) {
    activity.assets = {
      large_image: parsedImage,
      large_text: streamName,
    };
  }

  return activity;
}

module.exports = {
  buildStreamActivity,
  parseAssetImage,
  getFakeStartTimestamp,
  resetFakeStartTime,
};
