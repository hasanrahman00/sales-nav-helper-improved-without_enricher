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
  app.get(BASE_PATH, (req, res) => res.redirect(302, `${BASE_PATH}/`));
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

function isOriginAllowed(origin) {
  const allowAll = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true';
  if (allowAll) return true;

  const envAllowed = getAllowedOriginsFromEnv();
  if (envAllowed.length > 0) {
    return envAllowed.includes(origin);
  }

  // Safe defaults for common local + your production domains.
  // You can override via CORS_ORIGINS.
  try {
    const { hostname, protocol } = new URL(origin);
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
    if (isLocalHost && (protocol === 'http:' || protocol === 'https:')) return true;
    if (hostname === 'daddy-leads.com' || hostname.endsWith('.daddy-leads.com')) return true;
    return false;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  // Reflect requested headers/methods for preflight.
  const reqHeaders = req.headers['access-control-request-headers'];
  res.header(
    'Access-Control-Allow-Headers',
    reqHeaders ? String(reqHeaders) : 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

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

// Register API routes.  The route files only handle API paths and
// should return JSON.  Mount them under the `/api` prefix so they do
// not collide with frontend paths.
app.use(`${BASE_PATH}/api`, require('./routes/cookieRoutes'));
app.use(`${BASE_PATH}/api`, require('./routes/scrapeRoutes'));

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