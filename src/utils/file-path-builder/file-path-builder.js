import {
  eachDayOfInterval,
  eachHourOfInterval,
} from 'date-fns';
import { yyyy, MM, dd, hh, mm, ss } from '../date-regex/date-regex.js'
/**
 * Give a string with date patterns replaces patterns with actual data values
 *
 * @param {string} filePattern A string with year month etc date patters (up to seconds)
 * @param {Date} date JS Date object
 * @returns {string} A string with date patterns replaced with the date
 */
export function buildPath(filePattern, date) {
  const datePatternReplaceFns = [yyyy, MM, dd, hh, mm, ss];
  return datePatternReplaceFns.reduce((acc, replacer) => {
    return replacer(acc, date);
  }, filePattern);
}

/**
 * Given a date range returns an array of date objects
 *
 * @param {Date} from The from Date object
 * @param {Date} to The to Date object
 * @returns {Date[]} An array of dates within the to from from time range
 */
export function datesInRange(from, to) {
  return eachDayOfInterval({
    start: zeroDateMins(new Date(from)),
    end: zeroDateMins(new Date(to)),
  });
}

/**
 * Given a date range returns an array of date objects
 *
 * @param {Date} from The from Date object
 * @param {Date} to The to Date object
 * @returns {Date[]} An array of dates by hours within the to from from time range
 */
export function hoursInRange(from, to) {
  return eachHourOfInterval({
    start: new Date(from),
    end: new Date(to),
  });
}

/**
 * Sets a Date object minutes and seconds to 0
 *
 * @param {Date} date Date object
 * @returns {Date} A Date object with minutes and seconds set to 0
 */
export function zeroDateMins(date) {
  const zeroedDate = new Date(date);
  zeroedDate.setMinutes(0, 0);
  return zeroedDate;
}
