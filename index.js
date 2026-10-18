const { Client } = require('discord.js-selfbot-v13');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const { buildStreamActivity } = require('./src/command/StreamRPC');
const { runSpeedTest } = require('./src/command/speedtest');
const {
  applyPresence,
  startTripleOnline,
  setStatus,
  setDeviceMode,
  toggleStream,
  getStatusInfo,
} = require('./src/command/fakeOnline');
const {
  sendNhay,
  sendNhayRL,
  stopNhay,
  stopAllNhay,
  stopWatch,
  stopAllWatch
} = require('./src/command/nhay');
const {
  addMute,
  removeMute,
  isMuted,
  getMutedList
} = require('./src/command/mute');

// ─── Configuration ────────────────────────────────────────────────────────────

/** StreamRPC: title shown in streaming presence. */
const STREAM_NAME = 'Go run';

/** StreamRPC: Twitch channel URL. */
const TWITCH_URL = 'https://twitch.tv/yourchannel';

/** StreamRPC: URL hình ảnh / GIF động hiển thị trên RPC. */
const AVATAR_URL = 'https://cdn.discordapp.com/attachments/1544345565268025454/1551602220670259340/72a16faf-e6ef-44df-9e1d-f2d13197ba42.gif?ex=6ab291ac&is=6ab1402c&hm=378c658963602ea47385461157a02ddddd474390ae2067e4f5b79d39fb863947&';

const streamConfig = {
  streamName:    STREAM_NAME,
  twitchUrl:     TWITCH_URL,
  avatarUrl:     AVATAR_URL,
  imageUrl:      AVATAR_URL,
  details:       'Live Stream',
  state:         'Streaming 24/7',
  fakeHours:     100,              // Fake time: 100 giờ trước (~100h elapsed)
  // application_id là BẮT BUỘC để Discord hiển thị ảnh + text trên Rich Presence.
  // Dùng ID của VS Code (383226320970055681) — app công khai, không cần upload ảnh.
  applicationId: '383226320970055681',
};


// ─── Tokens (Đọc đa token từ file: 1 dòng = 1 token) ──────────────────────────

const TOKEN_PATH = path.join(__dirname, 'asset', 'login', 'token.txt');

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error(`[Auth] Không tìm thấy token: ${TOKEN_PATH}`);
    process.exit(1);
  }
  const content = fs.readFileSync(TOKEN_PATH, 'utf8');
  const tokens = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l !== 'YOUR_DISCORD_USER_TOKEN_HERE');

  if (tokens.length === 0) {
    console.error('[Auth] Hãy điền token vào asset/login/token.txt (mỗi dòng 1 token)');
    process.exit(1);
  }
  return [...new Set(tokens)];
}

// ─── Shared Spam Tracker & Anti-spam ──────────────────────────────────────────
// Map: channelId -> { userId, count }
const spamTracker = new Map();
const SPAM_LIMIT = 3; // số tin nhắn liên tiếp tối đa

// Set các guildId đang BẬT anti-spam (bật/tắt bằng lệnh 'a' / 'b')
const antiSpamGuilds = new Set();

function isBotCommand(content) {
  return (
    content === 'ping' ||
    content === '!ping' ||
    content === 'speedtest' ||
    content === '!speedtest' ||
    content === 'nhay' ||
    content === '!nhay' ||
    content.startsWith('nhay ') ||
    content.startsWith('!nhay ') ||
    content === 'nhay rl' ||
    content === '!nhay rl' ||
    content.startsWith('nhay rl ') ||
    content.startsWith('!nhay rl ') ||
    content === 'stop' ||
    content === '!stop' ||
    content === 'dung' ||
    content === 'av' ||
    content.startsWith('av ') ||
    content.startsWith('!av ') ||
    content === 'mute' ||
    content === '!mute' ||
    content.startsWith('mute ') ||
    content.startsWith('!mute ') ||
    content === 'unmute' ||
    content === '!unmute' ||
    content.startsWith('unmute ') ||
    content.startsWith('!unmute ') ||
    content === 'mutelist' ||
    content === '!mutelist' ||
    content === 'mute list' ||
    content === '!mute list' ||
    content === 'status' ||
    content === '!status' ||
    content.startsWith('status ') ||
    content.startsWith('!status ') ||
    content === 'device' ||
    content === '!device' ||
    content.startsWith('device ') ||
    content.startsWith('!device ') ||
    content === 'online all' ||
    content === '!online all' ||
    content === 'all online' ||
    content === '!all online' ||
    content === 'online' ||
    content === '!online' ||
    content.startsWith('online ') ||
    content.startsWith('!online ') ||
    content === 'idle' ||
    content === '!idle' ||
    content === 'dnd' ||
    content === '!dnd' ||
    content === 'invisible' ||
    content === '!invisible' ||
    content === 'a' ||
    content === 'b'
  );
}

// ─── Bot Instance Factory ─────────────────────────────────────────────────────

function createBot(token, index, total) {
  const client = new Client({
    checkUpdate: false,
    ws: {
      properties: {
        os: 'Windows',
        browser: 'Discord Client',
        device: '',
      },
    },
  });

  const state = {
    currentToken: token,
    reconnectAttempt: 0,
    isReconnecting: false,
  };

  const MAX_RECONNECT_DELAY = 60;

  function getReconnectDelay() {
    return Math.min(5 * Math.pow(2, state.reconnectAttempt), MAX_RECONNECT_DELAY);
  }

  async function scheduleReconnect(reason) {
    if (state.isReconnecting) return;
    state.isReconnecting = true;

    const delay = getReconnectDelay();
    state.reconnectAttempt++;
    const name = client.user?.tag || `Token #${index + 1}`;
    console.log(`[Reconnect] [${name}] 🔌 Mất kết nối (${reason}). Thử lại sau ${delay}s... (lần ${state.reconnectAttempt})`);

    await new Promise((r) => setTimeout(r, delay * 1000));

    try {
      await client.login(state.currentToken);
    } catch (err) {
      console.error(`[Reconnect] [${name}] ❌ Lỗi khi reconnect: ${err.message}`);
      state.isReconnecting = false;
      scheduleReconnect(err.message);
    }
  }

  client.on('ready', () => {
    console.log(`[Auth] [Account ${index + 1}/${total}] Đã đăng nhập: ${client.user.tag} (ID: ${client.user.id})`);
    state.reconnectAttempt = 0;
    state.isReconnecting = false;

    // Bật Fake Online Tất Cả Thiết Bị (Desktop + Mobile + Web) & Keep-Alive 24/7 cho tài khoản này
    startTripleOnline(client, state.currentToken, streamConfig);
  });

  client.on('shardDisconnect', (event, shardId) => {
    if (event.code === 4004) {
      const name = client.user?.tag || `Token #${index + 1}`;
      console.error(`[Reconnect] [${name}] ⛔ Token không hợp lệ, dừng reconnect tự động.`);
      return;
    }
    scheduleReconnect(`Shard ${shardId} disconnected (code ${event.code})`);
  });

  client.on('error', (err) => {
    const name = client.user?.tag || `Token #${index + 1}`;
    console.error(`[Client] [${name}] Lỗi:`, err.message);
  });

  client.on('messageCreate', async (message) => {
    // ── Xóa tin nhắn của user bị mute ──────────────────────────────────────────
    if (
      message.author &&
      message.author.id !== client.user?.id &&
      isMuted(message.author.id)
    ) {
      try {
        await message.delete();
        console.log(`[Mute] Đã xóa tin nhắn của ${message.author.tag || message.author.id} tại #${message.channel.name || message.channel.id}`);
      } catch (err) {
        console.error(`[Mute] Không thể xóa tin nhắn của ${message.author.tag || message.author.id}: ${err.message} (Cần quyền Quản lý tin nhắn)`);
      }
      return;
    }

    const content = message.content.toLowerCase().trim();

    // ── Phát hiện spam liên tiếp (chỉ trong server đang bật anti-spam) ───────────
    if (
      message.author.id !== client.user?.id &&
      !message.author.bot &&
      message.guild &&
      antiSpamGuilds.has(message.guild.id)
    ) {
      const channelId = message.channel.id;
      const userId    = message.author.id;
      const prev      = spamTracker.get(channelId);

      if (prev && prev.userId === userId) {
        prev.count++;
        if (prev.count >= SPAM_LIMIT) {
          prev.count = 0; // reset để không reply liên tục
          try {
            await message.reply('# Spam Có Giúp Con Mẹ Mày Khôn hôg=)))');
          } catch (e) {
            console.error('[Spam] Reply lỗi:', e.message);
          }
        }
      } else {
        spamTracker.set(channelId, { userId, count: 1 });
      }
    }

    // Kiểm tra nếu không phải là lệnh của bot thì bỏ qua
    if (!isBotCommand(content)) return;

    // Chỉ chủ tài khoản mới được dùng lệnh — user khác im lặng bỏ qua
    if (message.author.id !== client.user?.id) return;

    if (content === 'ping') {
      const sent = await message.reply('Đang tính độ trễ...');
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const wsPing = Math.round(client.ws.ping);
      await sent.edit(`🏓 **Pong!**\n- Độ trễ phản hồi: \`${latency}ms\`\n- Độ trễ WebSocket: \`${wsPing}ms\``);
    }

    if (content === 'speedtest' || content === '!speedtest') {
      let sent;
      try {
        sent = await message.reply('⚡ **Đang chuẩn bị kiểm tra tốc độ mạng...**');
        const result = await runSpeedTest(async (statusText) => {
          try {
            await sent.edit(`⚡ **Speedtest:** ${statusText}`);
          } catch {
            // ignore edit error
          }
        });

        await sent.edit(
          `🚀 **KẾT QUẢ SPEEDTEST**\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🌐 **Nhà mạng (ISP):** ${result.isp} (${result.location})\n` +
          `📶 **Ping:** \`${result.ping}ms\` (Jitter: \`${result.jitter}ms\`)\n` +
          `⬇️ **Download:** \`${result.download} Mbps\`\n` +
          `⬆️ **Upload:** \`${result.upload} Mbps\`\n` +
          `━━━━━━━━━━━━━━━━━━━━`
        );
      } catch (err) {
        if (sent) {
          await sent.edit(`❌ Lỗi khi thực hiện speedtest: ${err.message}`).catch(() => {});
        } else {
          await message.reply(`❌ Lỗi khi thực hiện speedtest: ${err.message}`).catch(() => {});
        }
      }
    }

    // Avatar command: av @user
    if (content === 'av' || content.startsWith('av ') || content.startsWith('!av ')) {
      try {
        let targetUser = null;

        if (message.mentions.users && message.mentions.users.size > 0) {
          targetUser = message.mentions.users.first();
        } else {
          const rawArg = message.content.trim().replace(/^!?av\s*/i, '').trim();
          const idMatch = rawArg.match(/^<@!?(\d+)>$/) || rawArg.match(/^(\d{17,20})$/);
          if (idMatch) {
            const id = idMatch[1];
            targetUser = await client.users.fetch(id).catch(() => null);
          }
        }

        if (!targetUser) {
          await message.reply('⚠️ Vui lòng tag hoặc nhập ID user. Ví dụ: `av @user`').catch(() => {});
        } else {
          const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 4096 });
          const tag = `${targetUser.username}`;
          await message.channel.send({
            content: `🖼️ Avatar của **${tag}**:`,
            files: [{ attachment: avatarUrl, name: `avatar_${targetUser.id}.${avatarUrl.includes('.gif') ? 'gif' : 'png'}` }],
          });
        }
      } catch (err) {
        console.error('[AV] Lỗi:', err);
        await message.reply(`❌ Lỗi: ${err.message}`).catch(() => {});
      }
    }

    // ── Lệnh Mute: mute @user / unmute @user / mutelist ──────────────────────────
    const isMuteCmd =
      content === 'mute' ||
      content === '!mute' ||
      content.startsWith('mute ') ||
      content.startsWith('!mute ');

    const isUnmuteCmd =
      content === 'unmute' ||
      content === '!unmute' ||
      content.startsWith('unmute ') ||
      content.startsWith('!unmute ');

    const isMuteListCmd =
      content === 'mutelist' ||
      content === '!mutelist' ||
      content === 'mute list' ||
      content === '!mute list';

    if (isMuteListCmd) {
      const list = getMutedList();
      if (list.length === 0) {
        await message.reply('📋 Danh sách mute hiện đang trống.').catch(() => {});
      } else {
        const items = list.map((id, itemIdx) => `${itemIdx + 1}. <@${id}> (\`${id}\`)`).join('\n');
        await message.reply(`🔇 **Danh sách user đang bị mute (${list.length}):**\n${items}`).catch(() => {});
      }
      return;
    }

    if (isMuteCmd) {
      try {
        const targetUserIds = [];

        // 1. Mentions (@user)
        if (message.mentions.users && message.mentions.users.size > 0) {
          message.mentions.users.forEach((u) => {
            if (u.id !== client.user.id && !targetUserIds.includes(u.id)) {
              targetUserIds.push(u.id);
            }
          });
        }

        // 2. Reply vào tin nhắn của user
        if (targetUserIds.length === 0 && message.reference && message.reference.messageId) {
          const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (repliedMsg && repliedMsg.author && repliedMsg.author.id !== client.user.id) {
            targetUserIds.push(repliedMsg.author.id);
          }
        }

        // 3. User ID truyền qua đối số
        if (targetUserIds.length === 0) {
          const rawArg = message.content.trim().replace(/^!?mute\s*/i, '').trim();
          const matches = rawArg.match(/\d{17,20}/g);
          if (matches) {
            for (const id of matches) {
              if (id !== client.user.id && !targetUserIds.includes(id)) {
                targetUserIds.push(id);
              }
            }
          }
        }

        // Im lặng nhận lệnh — không reply gì cả
        for (const id of targetUserIds) {
          if (!isMuted(id)) {
            addMute(id);
          }
        }

        // Xóa tin nhắn lệnh của chủ tài khoản
        await message.delete().catch(() => {});
      } catch (err) {
        console.error('[Mute] Lỗi:', err);
      }
      return;
    }

    if (isUnmuteCmd) {
      try {
        const targetUserIds = [];

        // 1. Mentions (@user)
        if (message.mentions.users && message.mentions.users.size > 0) {
          message.mentions.users.forEach((u) => {
            if (!targetUserIds.includes(u.id)) {
              targetUserIds.push(u.id);
            }
          });
        }

        // 2. Reply vào tin nhắn của user
        if (targetUserIds.length === 0 && message.reference && message.reference.messageId) {
          const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
          if (repliedMsg && repliedMsg.author) {
            targetUserIds.push(repliedMsg.author.id);
          }
        }

        // 3. User ID truyền qua đối số
        if (targetUserIds.length === 0) {
          const rawArg = message.content.trim().replace(/^!?unmute\s*/i, '').trim();
          const matches = rawArg.match(/\d{17,20}/g);
          if (matches) {
            for (const id of matches) {
              if (!targetUserIds.includes(id)) {
                targetUserIds.push(id);
              }
            }
          }
        }

        // Im lặng nhận lệnh — không reply gì cả
        for (const id of targetUserIds) {
          removeMute(id);
        }

        // Xóa tin nhắn lệnh của chủ tài khoản
        await message.delete().catch(() => {});
      } catch (err) {
        console.error('[Unmute] Lỗi:', err);
      }
      return;
    }

    const isNhayRL = content === 'nhay rl' || content === '!nhay rl' || content.startsWith('nhay rl ') || content.startsWith('!nhay rl ');
    if (isNhayRL) {
      try {
        let tag = '';
        if (message.mentions.users && message.mentions.users.size > 0) {
          tag = message.mentions.users.map((u) => `<@${u.id}>`).join(' ');
        } else {
          const rawAfterCmd = message.content.trim().replace(/^!?nhay\s+rl\s*/i, '');
          const idMatch = rawAfterCmd.match(/^<@!?(\d+)>|(\d{17,20})/);
          if (idMatch) {
            const id = idMatch[1] || idMatch[2];
            tag = `<@${id}>`;
          }
        }

        const res = await sendNhayRL(message.channel, tag, client);
        if (!res.success) {
          await message.reply(`❌ ${res.error}`).catch(() => {});
        }
      } catch (err) {
        console.error('[NhayRL] Lỗi:', err);
        await message.reply(`❌ Lỗi khi gửi: ${err.message}`).catch(() => {});
      }
      return;
    }

    const isNhay = content === 'nhay' || content === '!nhay' || content.startsWith('nhay ') || content.startsWith('!nhay ');
    if (isNhay) {
      try {
        let tag = '';
        if (message.mentions.users && message.mentions.users.size > 0) {
          tag = message.mentions.users.map((u) => `<@${u.id}>`).join(' ');
        } else {
          const rawAfterCmd = message.content.trim().replace(/^!?nhay\s*/i, '');
          const idMatch = rawAfterCmd.match(/^<@!?(\d+)>|(\d{17,20})/);
          if (idMatch) {
            const id = idMatch[1] || idMatch[2];
            tag = `<@${id}>`;
          }
        }

        const res = await sendNhay(message.channel, tag);
        if (!res.success) {
          await message.reply(`❌ ${res.error}`).catch(() => {});
        }
      } catch (err) {
        console.error('[Nhay] Lỗi:', err);
        await message.reply(`❌ Lỗi khi gửi: ${err.message}`).catch(() => {});
      }
    }

    if (content === 'stop' || content === '!stop' || content === 'dung') {
      stopNhay(message.channel.id);          // dừng nhay kênh hiện tại (đa tab)
      stopWatch(client, message.channel.id); // dừng watch chửi kênh hiện tại
    }

    // ── Lệnh Fake Online & Trạng thái: status / device / online / idle / dnd / invisible ──
    const isStatusCmd =
      content === 'status' ||
      content === '!status' ||
      content.startsWith('status ') ||
      content.startsWith('!status ') ||
      content === 'device' ||
      content === '!device' ||
      content.startsWith('device ') ||
      content.startsWith('!device ') ||
      content === 'online all' ||
      content === '!online all' ||
      content === 'all online' ||
      content === '!all online' ||
      content === 'online' ||
      content === '!online' ||
      content.startsWith('online ') ||
      content.startsWith('!online ') ||
      content === 'idle' ||
      content === '!idle' ||
      content === 'dnd' ||
      content === '!dnd' ||
      content === 'invisible' ||
      content === '!invisible';

    if (isStatusCmd) {
      try {
        let subArg = '';
        if (content.startsWith('status ') || content.startsWith('!status ')) {
          subArg = content.replace(/^!?status\s+/i, '').trim();
        } else if (content.startsWith('device ') || content.startsWith('!device ')) {
          subArg = content.replace(/^!?device\s+/i, '').trim();
        } else if (content === 'device' || content === '!device') {
          subArg = '';
        } else if (content === 'online all' || content === '!online all' || content === 'all online' || content === '!all online' || content === 'status all') {
          subArg = 'all';
        } else if (content.startsWith('online ') || content.startsWith('!online ')) {
          subArg = content.replace(/^!?online\s+/i, '').trim();
        } else if (content === 'online' || content === '!online') {
          subArg = 'online';
        } else if (content === 'idle' || content === '!idle') {
          subArg = 'idle';
        } else if (content === 'dnd' || content === '!dnd') {
          subArg = 'dnd';
        } else if (content === 'invisible' || content === '!invisible') {
          subArg = 'invisible';
        }

        if (!subArg) {
          const info = getStatusInfo(client);
          const msg =
            `⚡ **THÔNG TIN FAKE ONLINE (TRIPLE DEVICES)**\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `✨ **Chế độ thiết bị:** \`${info.deviceMode}\`\n` +
            `💻 **Desktop (Máy tính):** ${info.devices.desktop}\n` +
            `📱 **Mobile (iOS):** ${info.devices.mobile}\n` +
            `🌐 **Web (Trình duyệt):** ${info.devices.web}\n` +
            `🟢 **Trạng thái:** ${info.statusLabel}\n` +
            `🟣 **StreamRPC:** ${info.streamEnabled}\n` +
            `⏱️ **Uptime:** \`${info.uptime}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 **Lệnh chọn thiết bị Online:**\n` +
            `• \`status all\` (hoặc \`all online\`): Hiện Online **TẤT CẢ 3 thiết bị** (Desktop + Mobile + Web)\n` +
            `• \`status mobile\` (hoặc \`device mobile\`): Chỉ hiện Online trên **Mobile (iOS 📱)**\n` +
            `• \`status desktop\` (hoặc \`device desktop\`): Chỉ hiện Online trên **Desktop (Máy tính 💻)**\n` +
            `• \`status web\` (hoặc \`device web\`): Chỉ hiện Online trên **Web (Trình duyệt 🌐)**\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 **Lệnh đổi trạng thái:**\n` +
            `• \`status online\` (hoặc \`online\`): Trực tuyến 🟢\n` +
            `• \`status idle\` (hoặc \`idle\`): Chờ / Vắng mặt 🟡\n` +
            `• \`status dnd\` (hoặc \`dnd\`): Không làm phiền 🔴\n` +
            `• \`status invisible\` (hoặc \`invisible\`): Ẩn thân ⚫\n` +
            `• \`status stream on\` / \`status stream off\`: Bật / tắt StreamRPC`;
          await message.reply(msg).catch(() => {});
          return;
        }

        if (['all', 'mobile', 'desktop', 'web'].includes(subArg)) {
          const res = setDeviceMode(client, subArg, streamConfig);
          if (!res.success) {
            await message.reply(`❌ ${res.error}`).catch(() => {});
          } else {
            await message.reply(`✅ Đã chuyển chế độ hiển thị thiết bị sang: **${res.label}**`).catch(() => {});
          }
          return;
        }

        if (subArg === 'stream on') {
          toggleStream(client, true, streamConfig);
          await message.reply('🟣 Đã **BẬT** StreamRPC activity!').catch(() => {});
          return;
        }

        if (subArg === 'stream off') {
          toggleStream(client, false, streamConfig);
          await message.reply('⚪ Đã **TẮT** StreamRPC activity (chỉ hiện Fake Online thuần)!').catch(() => {});
          return;
        }

        const res = setStatus(client, subArg, streamConfig);
        if (!res.success) {
          await message.reply(`❌ ${res.error || 'Không thể đổi trạng thái!'}`).catch(() => {});
        } else {
          await message.reply(`✅ Đã chuyển trạng thái sang **${res.label.name}** (\`${res.deviceMode}\`)`).catch(() => {});
        }
      } catch (err) {
        console.error('[Status] Lỗi:', err);
        await message.reply(`❌ Lỗi: ${err.message}`).catch(() => {});
      }
      return;
    }

    // ── Anti-spam: bật/tắt theo từng server ──────────────────────────────────────
    if (content === 'a') {
      const guildId = message.guild?.id;
      if (guildId) {
        antiSpamGuilds.add(guildId);
        spamTracker.delete(message.channel.id);
      }
    }

    if (content === 'b') {
      const guildId = message.guild?.id;
      if (guildId) {
        antiSpamGuilds.delete(guildId);
      }
    }
  });

  // ── Xóa tin nhắn chỉnh sửa của user bị mute ──────────────────────────────────
  client.on('messageUpdate', async (_oldMessage, newMessage) => {
    try {
      const msg = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
      if (!msg || !msg.author) return;
      if (msg.author.id !== client.user?.id && isMuted(msg.author.id)) {
        await msg.delete();
        console.log(`[Mute] Đã xóa tin nhắn vừa chỉnh sửa của ${msg.author.tag || msg.author.id}`);
      }
    } catch (err) {
      // Bỏ qua lỗi nếu không đủ quyền xóa
    }
  });

  async function login() {
    try {
      await client.login(state.currentToken);
    } catch (err) {
      console.error(`[Auth] [Token #${index + 1}] ❌ Đăng nhập thất bại: ${err.message}`);
    }
  }

  return { client, login };
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  const tokens = loadTokens();
  console.log(`[Auth] 📋 Tìm thấy ${tokens.length} token trong file token.txt. Đang khởi chạy ${tokens.length} bot...`);

  const bots = tokens.map((token, index) => createBot(token, index, tokens.length));

  for (let i = 0; i < bots.length; i++) {
    await bots[i].login();
    if (bots.length > 1 && i < bots.length - 1) {
      // Giãn cách 2 giây giữa các lần login token khác nhau để tránh spam Discord Gateway
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

main().catch((err) => {
  console.error('[Auth] Lỗi khởi động bot:', err.message);
  process.exit(1);
});
