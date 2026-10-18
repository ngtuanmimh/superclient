/**
 * Module quản lý Fake Online & Trạng thái hoạt động (Presence)
 * Hỗ trợ hiện Online cùng lúc TẤT CẢ THIẾT BỊ (Triple Online: Desktop 💻 + Mobile 📱 + Web 🌐)
 * Giữ kết nối 24/7 không bị tự động chuyển sang AFK/Offline.
 * Hỗ trợ Đa tài khoản (Multi-token).
 */

const { Client } = require('discord.js-selfbot-v13');
const { buildStreamActivity } = require('./StreamRPC');

const STATUS_LABELS = {
  online:    { name: 'Trực tuyến 🟢 (Online)', emoji: '🟢' },
  idle:      { name: 'Chờ / Vắng mặt 🟡 (Idle)', emoji: '🟡' },
  dnd:       { name: 'Không làm phiền 🔴 (DND)', emoji: '🔴' },
  invisible: { name: 'Ẩn thân / Offline ⚫ (Invisible)', emoji: '⚫' },
};

const DEVICE_LABELS = {
  all:     '💻 Desktop + 📱 Mobile + 🌐 Web (Tất cả)',
  mobile:  '📱 Chỉ Mobile (Discord iOS)',
  desktop: '💻 Chỉ Desktop (Discord Client)',
  web:     '🌐 Chỉ Web (Chrome / Browser)',
};

// Map lưu trữ session cho từng main client: Map<Client, Session>
const sessions = new Map();

function getSession(client) {
  if (!client) {
    return sessions.values().next().value || null;
  }
  if (sessions.has(client)) {
    return sessions.get(client);
  }
  for (const [keyClient, session] of sessions.entries()) {
    if (keyClient === client || (client.user && keyClient.user && client.user.id === keyClient.user.id)) {
      return session;
    }
  }
  return sessions.values().next().value || null;
}

/**
 * Gửi presence cập nhật trạng thái tới một client cụ thể qua WebSocket shards.
 */
function sendClientPresence(client, status, streamConfig, streamEnabled) {
  if (!client || !client.ws) return;

  const activities = [];
  if (streamEnabled && streamConfig) {
    activities.push(buildStreamActivity(streamConfig));
  }

  const payload = {
    op: 3,
    d: {
      since: null,
      activities,
      status,
      afk: status === 'idle',
    },
  };

  try {
    client.ws.broadcast(payload);
  } catch (err) {
    console.error('[FakeOnline] Lỗi broadcast presence:', err.message);
  }
}

/**
 * Áp dụng presence cho một session cụ thể
 */
function applyPresenceForSession(session, streamConfig = null) {
  if (!session) return false;
  const effectiveConfig = streamConfig || session.activeStreamConfig;

  let desktopStatus = 'invisible';
  let mobileStatus  = 'invisible';
  let webStatus     = 'invisible';

  if (session.deviceMode === 'all') {
    desktopStatus = session.currentStatus;
    mobileStatus  = session.currentStatus;
    webStatus     = session.currentStatus;
  } else if (session.deviceMode === 'desktop') {
    desktopStatus = session.currentStatus;
  } else if (session.deviceMode === 'mobile') {
    mobileStatus  = session.currentStatus;
  } else if (session.deviceMode === 'web') {
    webStatus     = session.currentStatus;
  }

  if (session.mainClient && session.mainClient.isReady && session.mainClient.isReady()) {
    sendClientPresence(session.mainClient, desktopStatus, effectiveConfig, session.streamEnabled);
  }
  if (session.mobileClient && session.mobileClient.isReady && session.mobileClient.isReady()) {
    sendClientPresence(session.mobileClient, mobileStatus, effectiveConfig, session.streamEnabled);
  }
  if (session.webClient && session.webClient.isReady && session.webClient.isReady()) {
    sendClientPresence(session.webClient, webStatus, effectiveConfig, session.streamEnabled);
  }
  return true;
}

/**
 * Áp dụng presence cho một client hoặc toàn bộ client
 */
function applyPresence(clientOrConfig, streamConfig) {
  if (clientOrConfig && typeof clientOrConfig === 'object' && clientOrConfig.ws) {
    const session = getSession(clientOrConfig);
    return applyPresenceForSession(session, streamConfig);
  }
  for (const session of new Set(sessions.values())) {
    applyPresenceForSession(session, clientOrConfig);
  }
  return true;
}

/**
 * Khởi động hệ thống Fake Online đa thiết bị (Triple Online) cho 1 client
 */
function startTripleOnline(client, token, streamConfig) {
  let session = sessions.get(client);
  if (!session) {
    session = {
      mainClient: client,
      mobileClient: null,
      webClient: null,
      authToken: token,
      activeStreamConfig: streamConfig,
      currentStatus: 'online',
      deviceMode: 'all',
      streamEnabled: true,
      keepAliveTimer: null,
      startTime: Date.now(),
    };
    sessions.set(client, session);
  } else {
    session.mainClient = client;
    session.authToken = token;
    session.activeStreamConfig = streamConfig;
    if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
  }

  // 1. Áp dụng ngay presence cho main client (Desktop)
  applyPresenceForSession(session);

  const botTag = client.user?.tag || 'Bot';

  // 2. Khởi tạo phiên Mobile (Discord iOS) với độ trễ 6s để tránh Gateway rate limit
  if (!session.mobileClient) {
    session.mobileClient = new Client({
      checkUpdate: false,
      ws: {
        properties: {
          os: 'iOS',
          browser: 'Discord iOS',
          device: 'iPhone',
        },
      },
    });

    session.mobileClient.on('error', (err) => {
      console.error(`[MobileWS] [${botTag}] Lỗi:`, err.message);
    });

    session.mobileClient.on('ready', () => {
      console.log(`[FakeOnline] [${botTag}] Đã kết nối phiên di động: 📱 Discord iOS`);
      applyPresenceForSession(session);
    });

    setTimeout(() => {
      if (session.mobileClient && !session.mobileClient.isReady()) {
        session.mobileClient.login(session.authToken).catch((err) => {
          console.error(`[MobileWS] [${botTag}] Đăng nhập thất bại:`, err.message);
        });
      }
    }, 6000);
  }

  // 3. Khởi tạo phiên Web (Chrome) với độ trễ 12s để tránh Gateway rate limit
  if (!session.webClient) {
    session.webClient = new Client({
      checkUpdate: false,
      ws: {
        properties: {
          os: 'Windows',
          browser: 'Chrome',
          device: '',
        },
      },
    });

    session.webClient.on('error', (err) => {
      console.error(`[WebWS] [${botTag}] Lỗi:`, err.message);
    });

    session.webClient.on('ready', () => {
      console.log(`[FakeOnline] [${botTag}] Đã kết nối phiên trình duyệt: 🌐 Chrome Web`);
      applyPresenceForSession(session);
    });

    setTimeout(() => {
      if (session.webClient && !session.webClient.isReady()) {
        session.webClient.login(session.authToken).catch((err) => {
          console.error(`[WebWS] [${botTag}] Đăng nhập thất bại:`, err.message);
        });
      }
    }, 12000);
  }

  // 4. Keep-Alive: Gửi lại presence mỗi 2.5 phút
  session.keepAliveTimer = setInterval(() => {
    applyPresenceForSession(session);
  }, 2.5 * 60 * 1000);

  console.log(`[FakeOnline] [${botTag}] Đã kích hoạt Triple Online (Desktop + Mobile + Web) & Keep-Alive 24/7.`);
}

/**
 * Đổi trạng thái trực tuyến (online / idle / dnd / invisible)
 */
function setStatus(clientOrStatus, statusOrConfig, streamConfig) {
  let client = null;
  let status = '';
  let cfg = null;

  if (typeof clientOrStatus === 'string') {
    status = clientOrStatus;
    cfg = statusOrConfig;
  } else {
    client = clientOrStatus;
    status = statusOrConfig;
    cfg = streamConfig;
  }

  const normalized = (status || '').toLowerCase().trim();
  if (!STATUS_LABELS[normalized]) {
    return {
      success: false,
      error: `Trạng thái không hợp lệ! Hãy chọn một trong các: \`online\`, \`idle\`, \`dnd\`, \`invisible\`.`,
    };
  }

  const session = getSession(client);
  if (session) {
    session.currentStatus = normalized;
    applyPresenceForSession(session, cfg);
    return {
      success: true,
      status: session.currentStatus,
      label: STATUS_LABELS[session.currentStatus],
      deviceMode: DEVICE_LABELS[session.deviceMode] || session.deviceMode,
    };
  }

  return {
    success: true,
    status: normalized,
    label: STATUS_LABELS[normalized],
    deviceMode: DEVICE_LABELS['all'],
  };
}

/**
 * Đổi chế độ thiết bị (all / mobile / desktop / web)
 */
function setDeviceMode(clientOrMode, modeOrConfig, streamConfig) {
  let client = null;
  let mode = '';
  let cfg = null;

  if (typeof clientOrMode === 'string') {
    mode = clientOrMode;
    cfg = modeOrConfig;
  } else {
    client = clientOrMode;
    mode = modeOrConfig;
    cfg = streamConfig;
  }

  const normalized = (mode || '').toLowerCase().trim();
  if (!DEVICE_LABELS[normalized]) {
    return {
      success: false,
      error: `Thiết bị không hợp lệ! Hãy chọn: \`all\` (tất cả), \`mobile\` (điện thoại), \`desktop\` (máy tính), \`web\` (trình duyệt).`,
    };
  }

  const session = getSession(client);
  if (session) {
    session.deviceMode = normalized;
    applyPresenceForSession(session, cfg);
    return {
      success: true,
      deviceMode: session.deviceMode,
      label: DEVICE_LABELS[session.deviceMode],
    };
  }

  return {
    success: true,
    deviceMode: normalized,
    label: DEVICE_LABELS[normalized],
  };
}

/**
 * Bật/tắt StreamRPC activity
 */
function toggleStream(clientOrEnable, enableOrConfig, streamConfig) {
  let client = null;
  let enable = true;
  let cfg = null;

  if (typeof clientOrEnable === 'boolean') {
    enable = clientOrEnable;
    cfg = enableOrConfig;
  } else {
    client = clientOrEnable;
    enable = enableOrConfig;
    cfg = streamConfig;
  }

  const session = getSession(client);
  if (session) {
    session.streamEnabled = Boolean(enable);
    applyPresenceForSession(session, cfg);
    return {
      success: true,
      streamEnabled: session.streamEnabled,
    };
  }
  return {
    success: true,
    streamEnabled: Boolean(enable),
  };
}

/**
 * Lấy format thời gian uptime
 */
function getUptime(startTime) {
  const totalSeconds = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Lấy thông tin trạng thái Fake Online hiện tại
 */
function getStatusInfo(client = null) {
  const session = getSession(client);
  if (!session) {
    return {
      status: 'online',
      statusLabel: STATUS_LABELS.online.name,
      statusEmoji: STATUS_LABELS.online.emoji,
      deviceMode: DEVICE_LABELS.all,
      devices: {
        desktop: '🟡 Chưa kết nối',
        mobile:  '🟡 Chưa kết nối',
        web:     '🟡 Chưa kết nối',
      },
      streamEnabled: '🟣 Đang bật (Streaming)',
      uptime: '0s',
    };
  }

  const statusInfo = STATUS_LABELS[session.currentStatus] || { name: session.currentStatus, emoji: 'ℹ️' };
  const desktopReady = session.mainClient && session.mainClient.isReady && session.mainClient.isReady();
  const mobileReady  = session.mobileClient && session.mobileClient.isReady && session.mobileClient.isReady();
  const webReady     = session.webClient && session.webClient.isReady && session.webClient.isReady();

  return {
    status: session.currentStatus,
    statusLabel: statusInfo.name,
    statusEmoji: statusInfo.emoji,
    deviceMode: DEVICE_LABELS[session.deviceMode] || session.deviceMode,
    devices: {
      desktop: desktopReady ? '🟢 Đang kết nối' : '🟡 Đang khởi tạo...',
      mobile:  mobileReady  ? '🟢 Đang kết nối' : '🟡 Đang khởi tạo...',
      web:     webReady     ? '🟢 Đang kết nối' : '🟡 Đang khởi tạo...',
    },
    streamEnabled: session.streamEnabled ? '🟣 Đang bật (Streaming)' : '⚪ Đã tắt',
    uptime: getUptime(session.startTime),
  };
}

module.exports = {
  applyPresence,
  startTripleOnline,
  setStatus,
  setDeviceMode,
  toggleStream,
  getStatusInfo,
  STATUS_LABELS,
  DEVICE_LABELS,
};
