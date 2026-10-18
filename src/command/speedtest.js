/**
 * Module đo tốc độ mạng (Speedtest) sử dụng hạ tầng Cloudflare Speed Test API.
 * Không phụ thuộc thư viện ngoài, tương thích Node 18+.
 */

async function getPingAndJitter() {
  const pings = [];
  for (let i = 0; i < 4; i++) {
    const start = performance.now();
    try {
      await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' });
      const duration = performance.now() - start;
      pings.push(duration);
    } catch {
      // ignore individual failed ping
    }
  }

  if (pings.length === 0) return { ping: 0, jitter: 0 };

  const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
  let jitter = 0;
  if (pings.length > 1) {
    let diffSum = 0;
    for (let i = 1; i < pings.length; i++) {
      diffSum += Math.abs(pings[i] - pings[i - 1]);
    }
    jitter = diffSum / (pings.length - 1);
  }

  return {
    ping: Math.round(avgPing),
    jitter: Math.round(jitter),
  };
}

async function getIspInfo() {
  try {
    const res = await fetch('http://ip-api.com/json', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const city = data.city ? `${data.city}, ` : '';
      const country = data.countryCode || data.country || '';
      return {
        isp: data.isp || data.org || 'Unknown ISP',
        location: `${city}${country}`.trim() || 'Unknown Location',
        ip: data.query || '',
      };
    }
  } catch {
    // fallback
  }
  return { isp: 'Cloudflare Network', location: 'Auto', ip: '' };
}

async function testDownload(bytes = 10_000_000) {
  const start = performance.now();
  const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Download error: ${res.status}`);
  const buf = await res.arrayBuffer();
  const durationSec = (performance.now() - start) / 1000;
  const mbps = (buf.byteLength * 8) / 1_000_000 / durationSec;
  return mbps.toFixed(2);
}

async function testUpload(bytes = 3_000_000) {
  const payload = Buffer.alloc(bytes);
  const start = performance.now();
  const res = await fetch('https://speed.cloudflare.com/__up', {
    method: 'POST',
    body: payload,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Upload error: ${res.status}`);
  const durationSec = (performance.now() - start) / 1000;
  const mbps = (bytes * 8) / 1_000_000 / durationSec;
  return mbps.toFixed(2);
}

/**
 * Thực hiện speedtest toàn diện.
 * @param {(status: string) => Promise<void>} [onProgress]
 */
async function runSpeedTest(onProgress) {
  if (onProgress) await onProgress('Đang đo độ trễ (Ping) và thông tin ISP...');
  const [pingData, ispInfo] = await Promise.all([
    getPingAndJitter(),
    getIspInfo(),
  ]);

  if (onProgress) await onProgress('Đang đo tốc độ tải xuống (Download)...');
  let downloadSpeed = '0.00';
  try {
    downloadSpeed = await testDownload(10_000_000);
  } catch (err) {
    downloadSpeed = 'Lỗi';
  }

  if (onProgress) await onProgress('Đang đo tốc độ tải lên (Upload)...');
  let uploadSpeed = '0.00';
  try {
    uploadSpeed = await testUpload(3_000_000);
  } catch (err) {
    uploadSpeed = 'Lỗi';
  }

  return {
    isp: ispInfo.isp,
    location: ispInfo.location,
    ping: pingData.ping,
    jitter: pingData.jitter,
    download: downloadSpeed,
    upload: uploadSpeed,
  };
}

module.exports = { runSpeedTest };
