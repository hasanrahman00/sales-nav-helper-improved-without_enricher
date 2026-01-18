// utils/saveProfilesCsv.js
//
// A robust CSV writer for SignalHire and ContactOut profile objects.  This
// helper inspects existing CSV headers to choose the correct set of
// columns, supports BOM handling, and can append to existing files
// without corrupting column order.  Values are safely escaped so
// that commas, quotes and newlines do not break the CSV structure.

const fs = require('fs/promises');
const { existsSync, createReadStream } = require('fs');
const path = require('path');
const readline = require('readline');

// Base columns from SignalHire (use snake_case for keys)
const BASE_COLUMNS = [
  { key: 'name', header: 'Full Name' },
  { key: 'first_name', header: 'First Name' },
  { key: 'last_name', header: 'Last Name' },
  { key: 'title', header: 'Title' },
  { key: 'company', header: 'Company' },
  { key: 'person_location', header: 'Person Location' },
  { key: 'person_title', header: 'LinkedIn URL' },
];
// Column variants
// Include a single Website column mapped from the `domain` key.
const EXT_WEBSITE = [...BASE_COLUMNS, { key: 'domain', header: 'Website' }];

function esc(value) {
  if (value == null) return '""';
  const s = String(value)
    .replace(/\u0000/g, '')
    .replace(/\r?\n/g, ' ')
    .trim();
  return '"' + s.replace(/"/g, '""') + '"';
}

async function readHeaderLine(filePath) {
  if (!existsSync(filePath)) return null;
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const first = await new Promise((resolve) => {
    rl.once('line', (line) => resolve(line));
    rl.once('close', () => resolve(null));
  });
  rl.close();
  return first;
}

function chooseColumnsForExistingHeader(headerLine) {
  const lc = (headerLine || '').toLowerCase();
  const hasWebsite = lc.includes('website') || lc.includes('domain');
  return hasWebsite ? EXT_WEBSITE : BASE_COLUMNS;
}

function ensureKeysForColumns(rows, columns) {
  for (const r of rows) {
    for (const c of columns) {
      if (!Object.prototype.hasOwnProperty.call(r, c.key)) {
        r[c.key] = '';
      }
    }
  }
}

/**
 * Save an array of profile objects to CSV.  The function
 * automatically determines whether to append or write a new file
 * based on the `append` option and whether the file already
 * exists.  When appending, the existing header is used to
 * maintain column order.  When creating a new file, a sensible
 * default header (including Website) is chosen.  A BOM
 * may be prepended for Excel compatibility.  Missing keys are
 * added to rows as empty strings.
 *
 * @param {Object[]} rows Array of profile objects
 * @param {Object} opts Options
 * @param {string} opts.filePath Output CSV file path
 * @param {boolean} [opts.append] Whether to append to existing file; default: true if file exists
 * @param {boolean} [opts.includeBOM=true] Whether to include a BOM
 * @returns {Promise<string>} Absolute path to the saved file
 */
async function saveProfilesCsv(rows, opts = {}) {
  const { filePath = path.resolve(process.cwd(), 'output.csv'), append, includeBOM = true } = opts;
  if (!rows || rows.length === 0) return path.resolve(filePath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const fileExists = existsSync(filePath);
  const shouldAppend = append === true || (append === undefined && fileExists);
  let columns;
  if (fileExists) {
    const headerLine = await readHeaderLine(filePath);
    columns = chooseColumnsForExistingHeader(headerLine);
  } else {
    // New files: include Website column
    columns = EXT_WEBSITE;
  }
  ensureKeysForColumns(rows, columns);
  const header = columns.map((c) => esc(c.header || c.key)).join(',') + '\r\n';
  const body =
    rows
      .map((r) => columns.map((c) => esc(r[c.key] ?? '')).join(','))
      .join('\r\n') + '\r\n';
  if (shouldAppend) {
    if (!fileExists) {
      const prefix = includeBOM ? '\uFEFF' : '';
      await fs.appendFile(filePath, prefix + header + body);
    } else {
      await fs.appendFile(filePath, body);
    }
  } else {
    const prefix = includeBOM ? '\uFEFF' : '';
    await fs.writeFile(filePath, prefix + header + body);
  }
  return path.resolve(filePath);
}

module.exports = { saveProfilesCsv, COLUMNS: EXT_WEBSITE };