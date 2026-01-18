// utils/upgradeCsvHeaders.js
//
// Normalize CSV headers to the new standard (no Email column).
// Ensures the header order:
// Full Name, First Name, Last Name, Title, Company, Person Location, LinkedIn URL, Website
// Any other existing columns are preserved (except Email).

const fs = require('fs/promises');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const CANONICAL_HEADERS = [
  { header: 'Full Name', aliases: ['Full Name', 'Name', 'full name', 'fullname', 'full_name'] },
  { header: 'First Name', aliases: ['First Name', 'first_name', 'first name', 'firstname'] },
  { header: 'Last Name', aliases: ['Last Name', 'last_name', 'last name', 'lastname'] },
  { header: 'Title', aliases: ['Title', 'title'] },
  { header: 'Company', aliases: ['Company', 'company'] },
  { header: 'Person Location', aliases: ['Person Location', 'Location', 'person_location', 'person location', 'location'] },
  { header: 'LinkedIn URL', aliases: ['LinkedIn URL', 'LinkedIn', 'person_title', 'linkedin url', 'linkedin'] },
  { header: 'Website', aliases: ['Website', 'domain', 'Domain', 'domain1', 'domain2', 'domain3'] },
];

function ciFind(headers, name) {
  const needle = String(name).toLowerCase();
  return headers.find((h) => String(h).toLowerCase() === needle);
}

function getFirstAliasHeader(headers, aliases) {
  for (const alias of aliases) {
    const found = ciFind(headers, alias);
    if (found) return found;
  }
  return null;
}

function getValue(row, headers, aliases) {
  for (const alias of aliases) {
    const found = ciFind(headers, alias);
    if (found && row[found] != null && String(row[found]).trim() !== '') {
      return row[found];
    }
  }
  const fallback = getFirstAliasHeader(headers, aliases);
  return fallback ? row[fallback] ?? '' : '';
}

/**
 * Upgrade a CSV to the new header set (no Email). If the CSV already
 * matches the canonical headers and has no Email column, no changes are made.
 *
 * @param {string} filePath Path to the CSV to upgrade
 * @param {Object} [opts]
 * @param {boolean} [opts.backup=true] Whether to write a .bak backup
 * @returns {Promise<{changed:boolean, columns?:string[], reason?:string}>}
 */
async function upgradeCsvHeaders(filePath, { backup = true } = {}) {
  const full = path.resolve(filePath);
  const raw = await fs.readFile(full);
  const rows = parse(raw, {
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  if (!rows.length) return { changed: false, reason: 'empty' };

  const headers = Object.keys(rows[0]);
  const lowerHeaders = headers.map((h) => String(h).toLowerCase());
  const hasEmail = lowerHeaders.includes('email');

  const canonicalOrder = CANONICAL_HEADERS.map((c) => c.header);
  const alreadyCanonical =
    !hasEmail &&
    headers.length >= canonicalOrder.length &&
    canonicalOrder.every((h, i) => String(headers[i]).toLowerCase() === String(h).toLowerCase());

  const usedHeaders = new Set();
  const newRows = rows.map((row) => {
    const next = {};
    for (const c of CANONICAL_HEADERS) {
      const actual = getFirstAliasHeader(headers, c.aliases);
      if (actual) usedHeaders.add(actual.toLowerCase());
      next[c.header] = getValue(row, headers, c.aliases);
    }
    for (const h of headers) {
      const hLower = String(h).toLowerCase();
      if (hLower === 'email') continue;
      if (usedHeaders.has(hLower)) continue;
      next[h] = row[h] ?? '';
    }
    return next;
  });

  const extraHeaders = headers.filter((h) => {
    const hLower = String(h).toLowerCase();
    if (hLower === 'email') return false;
    return !CANONICAL_HEADERS.some((c) => c.aliases.some((a) => String(a).toLowerCase() === hLower));
  });

  const finalHeaders = [...canonicalOrder, ...extraHeaders];

  if (alreadyCanonical && !hasEmail) {
    return { changed: false, reason: 'already-canonical' };
  }

  const csv = stringify(newRows, { header: true, columns: finalHeaders, bom: true });
  if (backup) await fs.writeFile(full + '.bak', raw);
  await fs.writeFile(full, csv);
  return { changed: true, columns: finalHeaders };
}

module.exports = { upgradeCsvHeaders };
