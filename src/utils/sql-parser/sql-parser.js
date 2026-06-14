import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');
const SQL = require('@derekstride/tree-sitter-sql');

const FILE_QUERY = new Parser.Query(SQL, `
  (invocation
    (object_reference (identifier) @func (#match? @func "^read_"))
    (term (literal) @file (#match? @file "^'"))
  )
`);

const parser = new Parser();
parser.setLanguage(SQL);

export function extractFileReferences(query) {
  const tree = parser.parse(query);
  const seen = new Set();
  return FILE_QUERY.captures(tree.rootNode)
    .filter(capture => capture.name === 'file')
    .map(capture => ({ raw: capture.node.text.slice(1, -1) }))
    .filter(({ raw }) => {
      if (seen.has(raw)) return false;
      seen.add(raw);
      return true;
    });
}
