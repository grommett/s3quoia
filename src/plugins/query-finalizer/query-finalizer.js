import { removeFileDatePatterns } from '../../utils/date-regex/date-regex.js';
import { removeFileSettingTokens, removeDoubleFwdSlash, removeCacheSettings } from '../../utils/file-settings/file-settings.js';

export default class QueryFinalizerPlugin {
  name = 'CorePlugin';

  processQuery(context) {
    const { settings, bucketsDir, query } = context;
    const processedQuery = QueryFinalizerPlugin.prepareQuery(settings, bucketsDir, query);
    return { ...context, query: processedQuery };
  }

  static prepareQuery(settings, bucketsDir, query) {
    let prepared = query;

    settings.forEach((setting) => {
      const searchPattern = setting.sqlFileReference.replace(/\?cache=(true|false)/i, '');
      const fileRegexStr = QueryFinalizerPlugin.prepareFileRegexStr(searchPattern);
      prepared = prepared.replace(new RegExp(fileRegexStr, 'gi'), `${bucketsDir}/${setting.bucket}/${setting.file}`);
    });
    prepared = removeFileSettingTokens(prepared);
    prepared = removeFileDatePatterns(prepared);
    prepared = removeCacheSettings(prepared);
    prepared = removeDoubleFwdSlash(prepared);

    return prepared;
  }

  static prepareFileRegexStr(fileStr) {
    return fileStr
      .replace(/\*/g, '\\*')
      .replace(/\./g, '\\.')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\+/g, '\\+')
  }
}
