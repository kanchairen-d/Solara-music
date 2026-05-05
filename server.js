const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const API_BASE_URL = 'https://music-api.gdstudio.xyz/api.php';
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'accept-ranges',
  'content-length',
  'content-range',
  'etag',
  'last-modified',
  'expires'
];
const MAX_PALETTE_DIMENSION = 96;
const TARGET_SAMPLE_COUNT = 2400;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const PASSWORD = typeof process.env.PASSWORD === 'string' && process.env.PASSWORD.length > 0
  ? process.env.PASSWORD
  : null;

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

function createCorsHeaders(sourceHeaders = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (SAFE_RESPONSE_HEADERS.includes(String(key).toLowerCase())) {
      headers[key] = value;
    }
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'cache-control')) {
    headers['Cache-Control'] = 'no-store';
  }
  headers['Access-Control-Allow-Origin'] = '*';
  return headers;
}

function isAllowedKuwoHost(hostname) {
  return Boolean(hostname) && KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!isAllowedKuwoHost(parsed.hostname)) return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.protocol = 'http:';
    return parsed;
  } catch {
    return null;
  }
}

function isPublicPath(requestPath) {
  if (requestPath === '/login' || requestPath.startsWith('/login/')) return true;
  if (requestPath === '/api/login' || requestPath.startsWith('/api/login/')) return true;
  return /\.(css|js|png|svg|jpg|jpeg|gif|webp|ico|txt|map|json|woff|woff2)$/i.test(requestPath);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function componentToHex(value) {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, '0');
}

function rgbToHex({ r, g, b }) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function rgbToHsl(r, g, b) {
  const rNorm = clamp(r / 255, 0, 1);
  const gNorm = clamp(g / 255, 0, 1);
  const bNorm = clamp(b / 255, 0, 1);

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);
  const normalizedHue = ((h % 360) + 360) % 360 / 360;

  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    g: hueToRgb(p, q, normalizedHue) * 255,
    b: hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
  };
}

function hslToHex(color) {
  return rgbToHex(hslToRgb(color.h, color.s, color.l));
}

function relativeLuminance(r, g, b) {
  const normalize = (value) => {
    const channel = clamp(value / 255, 0, 1);
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const rLin = normalize(r);
  const gLin = normalize(g);
  const bLin = normalize(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function pickContrastColor(color) {
  return relativeLuminance(color.r, color.g, color.b) > 0.45 ? '#1f2937' : '#f8fafc';
}

function adjustSaturation(base, factor, offset = 0) {
  return clamp(base * factor + offset, 0, 1);
}

function adjustLightness(base, offset, factor = 1) {
  return clamp(base * factor + offset, 0, 1);
}

function resizeImage(image) {
  const maxSide = Math.max(image.width, image.height);
  if (maxSide <= MAX_PALETTE_DIMENSION) return image;

  const scale = MAX_PALETTE_DIMENSION / maxSide;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const resized = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(image.width - 1, Math.floor(x / scale));
      const srcIndex = (srcY * image.width + srcX) * 4;
      const destIndex = (y * width + x) * 4;
      resized[destIndex] = image.data[srcIndex];
      resized[destIndex + 1] = image.data[srcIndex + 1];
      resized[destIndex + 2] = image.data[srcIndex + 2];
      resized[destIndex + 3] = image.data[srcIndex + 3];
    }
  }

  return { width, height, data: resized };
}

function analyzeImageColors(image) {
  const { data } = image;
  const totalPixels = data.length / 4;
  const step = Math.max(1, Math.floor(totalPixels / TARGET_SAMPLE_COUNT));

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  let accent = null;

  for (let index = 0; index < data.length; index += step * 4) {
    const alpha = data[index + 3];
    if (alpha < 48) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    totalR += r;
    totalG += g;
    totalB += b;
    count += 1;

    const hsl = rgbToHsl(r, g, b);
    const vibrance = hsl.s;
    const balance = 1 - Math.abs(hsl.l - 0.5);
    const score = vibrance * 0.65 + balance * 0.35;

    if (!accent || score > accent.score) {
      accent = { color: hsl, score };
    }
  }

  if (count === 0) {
    throw new Error('No opaque pixels available for analysis');
  }

  const average = rgbToHsl(totalR / count, totalG / count, totalB / count);
  return { average, accent: accent ? accent.color : average };
}

function buildGradientStops(accent) {
  const lightColors = [
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.4, 0.08), l: adjustLightness(accent.l, 0.42, 0.52) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.52, 0.05), l: adjustLightness(accent.l, 0.26, 0.62) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.65), l: adjustLightness(accent.l, 0.12, 0.72) }),
  ];

  const darkColors = [
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.55, 0.04), l: adjustLightness(accent.l, 0.14, 0.38) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.62, 0.02), l: adjustLightness(accent.l, 0.04, 0.3) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.72), l: adjustLightness(accent.l, -0.04, 0.22) }),
  ];

  return {
    light: {
      colors: lightColors,
      gradient: `linear-gradient(140deg, ${lightColors[0]} 0%, ${lightColors[1]} 45%, ${lightColors[2]} 100%)`
    },
    dark: {
      colors: darkColors,
      gradient: `linear-gradient(135deg, ${darkColors[0]} 0%, ${darkColors[1]} 55%, ${darkColors[2]} 100%)`
    }
  };
}

function buildThemeTokens(accent) {
  return {
    light: {
      primaryColor: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.6, 0.06), l: adjustLightness(accent.l, 0.22, 0.6) }),
      primaryColorDark: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.72, 0.02), l: adjustLightness(accent.l, 0.06, 0.52) })
    },
    dark: {
      primaryColor: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.58, 0.04), l: adjustLightness(accent.l, 0.16, 0.42) }),
      primaryColorDark: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.68), l: adjustLightness(accent.l, 0.02, 0.32) })
    }
  };
}

async function buildPaletteResponse(imageUrl) {
  const jpegDecoder = await import('./functions/lib/vendor/jpeg-decoder.js');
  const upstream = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'image/jpeg,image/*;q=0.9,*/*;q=0.8'
    }
  });

  if (!upstream.ok) {
    const error = new Error(`Upstream request failed with status ${upstream.status}`);
    error.statusCode = upstream.status;
    throw error;
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(contentType.split(';')[0])) {
    const error = new Error('Unsupported content type');
    error.statusCode = 415;
    throw error;
  }

  const arrayBuffer = await upstream.arrayBuffer();
  const decoded = jpegDecoder.default(new Uint8Array(arrayBuffer), {
    useTArray: true,
    formatAsRGBA: true,
  });
  const image = resizeImage({
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  });
  const analyzed = analyzeImageColors(image);
  const gradients = buildGradientStops(analyzed.accent);
  const tokens = buildThemeTokens(analyzed.accent);
  const accentRgb = hslToRgb(analyzed.accent.h, analyzed.accent.s, analyzed.accent.l);

  return {
    source: imageUrl,
    baseColor: hslToHex(analyzed.accent),
    averageColor: hslToHex(analyzed.average),
    accentColor: hslToHex(analyzed.accent),
    contrastColor: pickContrastColor(accentRgb),
    gradients,
    tokens,
  };
}

app.use((req, res, next) => {
  if (!PASSWORD) return next();
  if (isPublicPath(req.path)) return next();

  const authCookie = req.cookies ? req.cookies.auth : null;
  const expected = Buffer.from(PASSWORD, 'utf8').toString('base64');
  if (authCookie === expected) {
    return next();
  }
  return res.redirect(302, '/login');
});

app.post('/api/login', (req, res) => {
  if (!PASSWORD) {
    return res.json({ success: true });
  }
  const providedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  if (providedPassword !== PASSWORD) {
    return res.status(401).json({ success: false });
  }

  const encoded = Buffer.from(PASSWORD, 'utf8').toString('base64');
  res.cookie('auth', encoded, {
    maxAge: 48 * 60 * 60 * 1000,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: false
  });
  return res.json({ success: true });
});

app.get('/proxy', async (req, res) => {
  try {
    const target = req.query.target;
    if (typeof target === 'string' && target) {
      const normalized = normalizeKuwoUrl(target);
      if (!normalized) {
        return res.status(400).send('Invalid target');
      }

      const headers = {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        Referer: 'https://www.kuwo.cn/'
      };
      if (req.get('Range')) {
        headers.Range = req.get('Range');
      }

      const upstream = await fetch(normalized.toString(), {
        method: req.method,
        headers,
      });

      const responseHeaders = createCorsHeaders(Object.fromEntries(upstream.headers.entries()));
      if (!Object.keys(responseHeaders).some((key) => key.toLowerCase() === 'cache-control')) {
        responseHeaders['Cache-Control'] = 'public, max-age=3600';
      }
      res.status(upstream.status);
      Object.entries(responseHeaders).forEach(([key, value]) => res.setHeader(key, value));
      if (!upstream.body) {
        return res.end();
      }
      const arrayBuffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    const apiUrl = new URL(API_BASE_URL);
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'target' || key === 'callback') continue;
      if (Array.isArray(value)) {
        apiUrl.searchParams.set(key, value[0]);
      } else if (typeof value === 'string') {
        apiUrl.searchParams.set(key, value);
      }
    }

    if (!apiUrl.searchParams.has('types')) {
      return res.status(400).send('Missing types');
    }

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        'User-Agent': req.get('User-Agent') || 'Mozilla/5.0',
        Accept: 'application/json'
      }
    });

    const responseHeaders = createCorsHeaders(Object.fromEntries(upstream.headers.entries()));
    if (!Object.keys(responseHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      responseHeaders['Content-Type'] = 'application/json; charset=utf-8';
    }

    res.status(upstream.status);
    Object.entries(responseHeaders).forEach(([key, value]) => res.setHeader(key, value));
    const text = await upstream.text();
    return res.send(text);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Proxy request failed', detail: String(error && error.message ? error.message : error) });
  }
});

app.get('/palette', async (req, res) => {
  try {
    const imageParam = typeof req.query.image === 'string'
      ? req.query.image
      : (typeof req.query.url === 'string' ? req.query.url : '');

    if (!imageParam) {
      return res.status(400).json({ error: 'Missing image parameter' });
    }

    let target;
    try {
      target = new URL(imageParam);
    } catch {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    const palette = await buildPaletteResponse(target.toString());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(palette);
  } catch (error) {
    const statusCode = Number(error && error.statusCode) || 500;
    console.error('Palette generation failed:', error);
    return res.status(statusCode).json({
      error: statusCode === 415 ? 'Unsupported content type' : 'Failed to analyze image',
      detail: String(error && error.message ? error.message : error)
    });
  }
});

app.get('/api/storage', (req, res) => {
  const statusOnly = req.query.status;
  if (statusOnly) {
    return res.json({ d1Available: false });
  }
  return res.json({ d1Available: false, data: {} });
});
app.post('/api/storage', (req, res) => {
  return res.json({ success: true, d1Available: false, updated: 0 });
});
app.delete('/api/storage', (req, res) => {
  return res.json({ success: true, d1Available: false, deleted: 0 });
});

app.use(express.static(path.resolve(__dirname), {
  extensions: ['html']
}));

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'login.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Solara Node server listening on 0.0.0.0:${PORT}`);
});
