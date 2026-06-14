const DIGITS_4 = '\\d{4}';
const DIGITS_2 = '\\d{2}';

export function yyyy(str, date) {
  return str.replaceAll('{yyyy}', String(date.getFullYear()));
}

export function MM(str, date) {
  return str.replaceAll('{MM}', String(date.getMonth() + 1).padStart(2, '0'));
}

export function dd(str, date) {
  return str.replaceAll('{dd}', String(date.getDate()).padStart(2, '0'));
}

export function hh(str, date) {
  return str.replaceAll('{hh}', String(date.getHours()).padStart(2, '0'));
}

export function mm(str, date) {
  return str.replaceAll('{mm}', String(date.getMinutes()).padStart(2, '0'));
}

export function ss(str, date) {
  return str.replaceAll('{ss}', String(date.getSeconds()).padStart(2, '0'));
}

export function regexFromPattern(pattern = '') {
  const regex = pattern
    .replaceAll('/', '\\/')
    .replaceAll('.', '\\.')
    .replaceAll('+', '\\+')
    .replaceAll('{yyyy}', DIGITS_4)
    .replaceAll('{MM}', DIGITS_2)
    .replaceAll('{dd}', DIGITS_2)
    .replaceAll('{hh}', DIGITS_2)
    .replaceAll('{mm}', DIGITS_2)
    .replaceAll('{ss}', DIGITS_2)
    .replaceAll('*', '.*?');

  return new RegExp(regex);
}

export function removeFileDatePatterns(query = '') {
  return query
    .replaceAll('{yyyy}', '*')
    .replaceAll('{MM}', '*')
    .replaceAll('{mm}', '*')
    .replaceAll('{dd}', '*')
    .replaceAll('{hh}', '*')
    .replaceAll('{ss}', '*');
}
