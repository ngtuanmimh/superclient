const { EMOJIS } = require('./emoji');

/**
 * Gửi custom status (dòng ghi chú ở profile) trực tiếp qua raw Gateway op3.
 * Cách này bypass setPresence wrapper của thư viện, đáng tin cậy hơn với selfbot.
 *
 * @param {import('discord.js-selfbot-v13').Client} client
 * @param {string}   statusText      – text đi kèm emoji (để '' nếu chỉ muốn emoji)
 * @param {object[]} extraActivities – activity khác giữ nguyên (StreamRPC...)
 * @returns {NodeJS.Timeout}
 */
function startCustomStatus(client, statusText = '', extraActivities = []) {
  let index = 0;

  const sendPresence = (emojiObj, text) => {
    const emojiStr = emojiObj.animated
      ? `<a:${emojiObj.name}:${emojiObj.id}>`
      : `<:${emojiObj.name}:${emojiObj.id}>`;

    const state = text ? `${emojiStr} ${text}` : emojiStr;

    const activities = [
      {
        type: 4,                  // CUSTOM STATUS
        name: 'Custom Status',
        state: state,
        emoji: {
          id: emojiObj.id,
          name: emojiObj.name,
          animated: emojiObj.animated,
        },
      },
      ...extraActivities,
    ];

    // Gửi raw Gateway Opcode 3 (UPDATE_PRESENCE) thẳng lên Discord
    try {
      const shard = client.ws.shards.first();
      if (shard) {
        shard.send({
          op: 3,
          d: {
            since: null,
            activities: activities,
            status: 'online',
            afk: false,
          },
        });
        console.log(`[CustomStatus] ${index}→ ${state}`);
      } else {
        console.error('[CustomStatus] Shard chưa sẵn sàng.');
      }
    } catch (err) {
      console.error('[CustomStatus] Lỗi gửi presence:', err.message);
    }
  };

  const tick = () => {
    const emoji = EMOJIS[index];
    sendPresence(emoji, statusText);
    index = (index + 1) % EMOJIS.length;
  };

  tick(); // chạy ngay lập tức
  const interval = setInterval(tick, 2000); // đổi mỗi 2 giây
  console.log('[CustomStatus] Đã bắt đầu cycling (2 s/emoji).');
  return interval;
}

module.exports = { startCustomStatus };
