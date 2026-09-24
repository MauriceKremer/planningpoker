/**
 * Pure seasonal-window logic — shared by the SPA (themes.js) and the prebuild
 * meta-sync script (client/scripts/sync-season-meta.mjs) so the MM-DD window
 * rules exist exactly once in JS land.
 *
 * ESM (client/package.json has "type": "module"), loaded by the prebuild
 * script via dynamic import and bundled for the SPA by Vite. Keep this file
 * free of imports so it stays trivially loadable by both.
 */

/**
 * Parse an MM-DD date string into a { month, day } object.
 * @param {string} mmdd
 * @returns {{ month: number, day: number }}
 */
function parseWindowDate(mmdd) {
  const [month, day] = mmdd.split('-').map(Number);
  return { month, day };
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Clamp Feb 29 to Feb 28 on non-leap years so recurring windows stay stable.
 * @param {{ month: number, day: number }} date
 * @param {number} year
 */
function clampFeb29(date, year) {
  if (date.month === 2 && date.day === 29 && !isLeapYear(year)) {
    return { month: 2, day: 28 };
  }
  return date;
}

function dateKey(date) {
  return date.month * 100 + date.day;
}

function isWithinWindow(current, start, end) {
  const currentKey = dateKey(current);
  const startKey = dateKey(start);
  const endKey = dateKey(end);

  if (startKey <= endKey) {
    return currentKey >= startKey && currentKey <= endKey;
  }
  // Wrap-around window (e.g. Nov 24 -> Jan 6)
  return currentKey >= startKey || currentKey <= endKey;
}

/**
 * Resolve the active theme for a given date from the themes array.
 * First matching window wins; falls back to the entry with id "default".
 * Windows use recurring MM-DD strings and may wrap the year boundary.
 *
 * @param {Array} themes
 * @param {Date} [date=new Date()]
 * @returns {object | undefined}
 */
function resolveTheme(themes, date = new Date()) {
  const year = date.getFullYear();
  const current = clampFeb29(
    { month: date.getMonth() + 1, day: date.getDate() },
    year
  );

  const candidate = themes.find((theme) => {
    if (!theme.start || !theme.end) return false;
    const start = clampFeb29(parseWindowDate(theme.start), year);
    const end = clampFeb29(parseWindowDate(theme.end), year);
    return isWithinWindow(current, start, end);
  });

  if (candidate) return candidate;
  return themes.find((theme) => theme.id === 'default');
}

export {
  parseWindowDate,
  isLeapYear,
  clampFeb29,
  dateKey,
  isWithinWindow,
  resolveTheme,
};