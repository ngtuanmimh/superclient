const https = require('https');
const http  = require('http');

/**
 * Fetch TikTok user profile info by username.
 * Scrapes the public profile page and extracts user data from the embedded JSON.
 * @param {string} username - TikTok username (without @).
 * @returns {Promise<{success:boolean, data?:object, error?:string}>}
 */
async function getTikTokUser(username) {
  const clean = username.replace(/^@/, '').trim();
  const url   = `https://www.tiktok.com/@${encodeURIComponent(clean)}`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        const lib = loc.startsWith('https') ? https : http;
        const r2  = lib.get(loc, { headers: req._headers }, (res2) => handleBody(res2, resolve, clean, url));
        r2.on('error', (e) => resolve({ success: false, error: e.message }));
        return;
      }
      handleBody(res, resolve, clean, url);
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
  });
}

function handleBody(res, resolve, username, profileUrl) {
  let body = '';
  res.on('data', (c) => { body += c; if (body.length > 2_000_000) res.destroy(); });
  res.on('end', () => {
    try {
      // TikTok embeds data as: <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
      const match = body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
      if (!match) {
        // fallback: try NEXT_DATA
        const nd = body.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
        if (nd) {
          const json = JSON.parse(nd[1]);
          const u = json?.props?.pageProps?.userInfo?.user;
          const s = json?.props?.pageProps?.userInfo?.stats;
          if (u) return resolve({ success: true, data: buildData(u, s, profileUrl) });
        }
        return resolve({ success: false, error: 'Không lấy được dữ liệu người dùng (có thể TikTok chặn).' });
      }

      const json = JSON.parse(match[1]);
      // Navigate to user detail
      const defaultScope = json?.['__DEFAULT_SCOPE__'] || {};
      const webDetail   = defaultScope['webapp.user-detail'] || {};
      const userInfo    = webDetail?.userInfo || {};
      const u           = userInfo?.user  || userInfo?.User;
      const s           = userInfo?.stats || userInfo?.Stats;

      if (!u) return resolve({ success: false, error: 'Không tìm thấy user TikTok.' });

      resolve({ success: true, data: buildData(u, s, profileUrl) });
    } catch (e) {
      resolve({ success: false, error: 'Parse error: ' + e.message });
    }
  });
  res.on('error', (e) => resolve({ success: false, error: e.message }));
}

function buildData(u, s, profileUrl) {
  return {
    username:    u.uniqueId    || u.UniqueId    || '?',
    nickname:    u.nickname    || u.NickName    || '?',
    bio:         u.signature   || u.Signature   || '',
    avatar:      u.avatarLarger|| u.AvatarLarger|| u.avatarMedium || u.AvatarMedium || '',
    verified:    !!(u.verified  || u.Verified),
    followers:   fmtNum(s?.followerCount  || s?.FollowerCount  || 0),
    following:   fmtNum(s?.followingCount || s?.FollowingCount || 0),
    likes:       fmtNum(s?.heartCount     || s?.HeartCount     || s?.heart || 0),
    videos:      fmtNum(s?.videoCount     || s?.VideoCount     || 0),
    profileUrl,
  };
}

function fmtNum(n) {
  n = parseInt(n) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

module.exports = { getTikTokUser };
