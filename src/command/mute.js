const fs = require('fs');
const path = require('path');

const MUTE_FILE = path.join(__dirname, '..', '..', 'asset', 'muted_users.json');

// Set: userIds đang bị mute
const mutedUsers = new Set();

/**
 * Đọc danh sách user bị mute từ file JSON khi khởi động
 */
function loadMutedUsers() {
  try {
    if (fs.existsSync(MUTE_FILE)) {
      const data = JSON.parse(fs.readFileSync(MUTE_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((id) => {
          if (id && typeof id === 'string') mutedUsers.add(id);
        });
      }
    }
  } catch (err) {
    console.error('[Mute] Lỗi đọc file muted_users.json:', err.message);
  }
}

/**
 * Lưu danh sách user bị mute vào file JSON để không bị mất khi restart
 */
function saveMutedUsers() {
  try {
    const dir = path.dirname(MUTE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MUTE_FILE, JSON.stringify([...mutedUsers], null, 2), 'utf8');
  } catch (err) {
    console.error('[Mute] Lỗi lưu file muted_users.json:', err.message);
  }
}

// Khởi tạo danh sách từ file
loadMutedUsers();

/**
 * Thêm user vào danh sách mute
 * @param {string} userId
 * @returns {boolean} true nếu mới thêm, false nếu đã có
 */
function addMute(userId) {
  if (!userId) return false;
  if (mutedUsers.has(userId)) return false;
  mutedUsers.add(userId);
  saveMutedUsers();
  return true;
}

/**
 * Xóa user khỏi danh sách mute
 * @param {string} userId
 * @returns {boolean} true nếu xóa thành công, false nếu không tìm thấy
 */
function removeMute(userId) {
  if (!userId) return false;
  const deleted = mutedUsers.delete(userId);
  if (deleted) saveMutedUsers();
  return deleted;
}

/**
 * Kiểm tra user có đang bị mute hay không
 * @param {string} userId
 * @returns {boolean}
 */
function isMuted(userId) {
  if (!userId) return false;
  return mutedUsers.has(userId);
}

/**
 * Lấy danh sách ID user đang bị mute
 * @returns {string[]}
 */
function getMutedList() {
  return [...mutedUsers];
}

module.exports = {
  addMute,
  removeMute,
  isMuted,
  getMutedList,
};
