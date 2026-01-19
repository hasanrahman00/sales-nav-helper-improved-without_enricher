// server.js 
// entry file

const path = require('path');
const express = require('express');

// Create the Express application.  This app serves the static frontend
// assets out of the `public` folder and exposes two API routes for
// saving a cookie and triggering a scrape.  Keeping all of the route
// handlers in separate files (under the routes folder) makes the
const app = express();

// If deployed behind a reverse proxy (NGINX/Cloudflare), this helps Express
// correctly detect protocol/IP when you rely on them.
app.set('trust proxy', 1);

// Optional base path (useful when your VPS/reverse-proxy serves this app under
// a prefix like https://api.example.com/salesnav).
function normalizeBasePath(raw) {
  if (!raw) return '';
  let base = String(raw).trim();
  if (!base) return '';
  base = base.replace(/\/+$/g, '');
  if (base === '/') return '';
  if (!base.startsWith('/')) base = `/${base}`;
  return base;
}

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || process.env.APP_BASE_PATH);

// If using a BASE_PATH, ensure the directory URL ends with a trailing slash.
// This prevents relative asset paths like "app.js" from resolving to "/app.js".
if (BASE_PATH) {
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Express (with strict routing off) treats `/salesnav` and `/salesnav/` as equivalent
    // for route matching, so we must only redirect when the request URL is EXACTLY
    // the non-trailing-slash form.
    const originalUrl = req.originalUrl || '';
    if (originalUrl === BASE_PATH) {
      return res.redirect(302, `${BASE_PATH}/`);
    }
    if (originalUrl.startsWith(`${BASE_PATH}?`)) {
      // Preserve query string.
      return res.redirect(302, `${BASE_PATH}/${originalUrl.slice(BASE_PATH.length)}`);
    }
    return next();
  });
}



// CORS support (works for both local + production).
// IMPORTANT: If your frontend sends credentials (cookies/Authorization),
// browsers will reject `Access-Control-Allow-Origin: *`.
function getAllowedOriginsFromEnv() {
  const raw = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const fromEnv = getAllowedOriginsFromEnv();
  if (fromEnv.length > 0) return fromEnv;
  // Default allowlist (credentials-safe). Keep this tight.
  return [
    'https://api.daddy-leads.com',
    'http://localhost:3000',
  ];
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Always vary on Origin when doing allowlist CORS.
  res.header('Vary', 'Origin');

  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  // Reflect requested headers/methods for preflight.
  const reqHeaders = req.headers['access-control-request-headers'];
  res.header(
    'Access-Control-Allow-Headers',
    reqHeaders ? String(reqHeaders) : 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    // If there's an Origin and it's not allowed, fail the preflight explicitly.
    if (origin && !isOriginAllowed(origin)) {
      return res.status(403).send('CORS origin not allowed');
    }
    return res.sendStatus(204);
  }

  // For non-preflight requests, block only if browser-origin is present and disallowed.
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'CORS origin not allowed', origin });
  }

  return next();
});

// Middleware to parse JSON bodies.  Without this, Express will not
// understand the JSON sent from the frontend.
app.use(express.json({ limit: '10mb' }));

// Serve the compiled frontend assets from the `public` directory.  Any
// static files (HTML, CSS, JS) placed under `public` will be served
// relative to the root of the web server.
app.use(BASE_PATH || '/', express.static(path.join(__dirname, 'public')));

// Ensure the data directory exists and perform an initial cleanup of old files.
const { ensureDataDir, cleanupOldFiles } = require('./utils/dataManager');

ensureDataDir().catch(() => {});
// Clean up files older than 3 days on startup.  Failure to delete old
// files will not stop the server.
cleanupOldFiles().catch(() => {});

// -----------------------------------------------------------------------------
// Jobs persistence on startup
//
// The scraping jobs are persisted across server restarts via JSON files in
// the `all_jobs` directory.  At startup we ensure the directory exists,
// load any existing jobs into memory, and clean up job files older than
// three days.  These asynchronous operations are fire‑and‑forget; any
// failures (e.g. permission errors) are ignored so that the server still
// starts.  The loaded jobs will be available via the jobsManager API.
const {
  ensureJobsDir,
  loadJobs,
  cleanupOldJobs,
} = require('./utils/jobsManager');

ensureJobsDir().catch(() => {});

loadJobs().catch(() => {});

cleanupOldJobs().catch(() => {});

// Register API routes.
// These are mounted directly under BASE_PATH so the public endpoints are:
//   /salesnav/save-cookie, /salesnav/status, ... (no extra /api prefix)
app.use(`${BASE_PATH || ''}`, require('./routes/cookieRoutes'));
app.use(`${BASE_PATH || ''}`, require('./routes/scrapeRoutes'));

// The browser and third‑party login checks are performed lazily within
// the scrape route.  We intentionally avoid launching a browser at
// startup so that the application does not open windows until the user
// initiates a scrape.

// Catch‑all handler to return the frontend for any unknown route.  This
// allows direct browser navigation to a deep link (e.g. `/about`) and
// still serves the SPA.  A wildcard route of '*' is not valid in
// Express; using a wildcard pattern with a leading slash matches all
// paths that have not been served by previous middleware.
app.use(BASE_PATH || '/', (req, res, next) => {
  // Only serve the SPA shell for GET/HEAD. Let other methods fall through.
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the HTTP server on the configured port.  The port can be
// supplied via the `PORT` environment variable or defaults to 3000.
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});