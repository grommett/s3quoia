const EXAMPLE_QUERIES = {
  'all-sales': "SELECT * FROM read_parquet('sales/**/*.parquet', union_by_name=true) ORDER BY date LIMIT 50",
  'by-product':
    "SELECT product, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total\nFROM read_parquet('sales/**/*.parquet', union_by_name=true)\nGROUP BY product\nORDER BY total DESC",
  'by-region':
    "SELECT region, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total\nFROM read_parquet('sales/**/*.parquet', union_by_name=true)\nGROUP BY region\nORDER BY total DESC",
  products: "SELECT * FROM read_parquet('products/catalog.parquet') ORDER BY price",
  join: "SELECT s.date, s.product, s.amount, p.category, p.price AS list_price\nFROM read_parquet('sales/**/*.parquet', union_by_name=true) s\nJOIN read_parquet('products/catalog.parquet') p ON s.product = p.name\nORDER BY s.date\nLIMIT 20",
};

const DUCKDB_COMPLETIONS = [
  {
    label: 'read_parquet',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "read_parquet('${1:path/**/*.parquet}', union_by_name=true)",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — read Parquet files (glob supported)',
  },
  {
    label: 'read_csv',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "read_csv('${1:path/**/*.csv}', union_by_name=true)",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — read CSV files (auto-detected schema)',
  },
  {
    label: 'read_json_auto',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "read_json_auto('${1:path/**/*.json}')",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — read JSON files (auto schema)',
  },
  {
    label: 'read_ndjson',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "read_ndjson('${1:path/**/*.ndjson}', union_by_name=true)",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — read newline-delimited JSON',
  },
  {
    label: 'APPROX_COUNT_DISTINCT',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'APPROX_COUNT_DISTINCT(${1:column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — fast approximate distinct count (HyperLogLog)',
  },
  {
    label: 'MEDIAN',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'MEDIAN(${1:column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — exact median',
  },
  {
    label: 'MODE',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'MODE(${1:column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — most frequent value',
  },
  {
    label: 'STRING_AGG',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "STRING_AGG(${1:column}, '${2:,}')",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — concatenate strings with separator',
  },
  {
    label: 'PERCENTILE_CONT',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'PERCENTILE_CONT(${1:0.5}) WITHIN GROUP (ORDER BY ${2:column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — continuous percentile (e.g. p50, p95)',
  },
  {
    label: 'DATE_TRUNC',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "DATE_TRUNC('${1|year,month,week,day,hour|}', ${2:column})",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — truncate date to unit',
  },
  {
    label: 'DATE_DIFF',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "DATE_DIFF('${1|day,month,year,hour|}', ${2:start}, ${3:end})",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — difference between two dates',
  },
  {
    label: 'STRFTIME',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: "STRFTIME(${1:column}, '${2:%Y-%m-%d}')",
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — format date as string',
  },
  {
    label: 'EPOCH_MS',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'EPOCH_MS(${1:milliseconds})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — convert epoch milliseconds to TIMESTAMP',
  },
  {
    label: 'TRY_CAST',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'TRY_CAST(${1:value} AS ${2:type})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — cast returning NULL on failure',
  },
  {
    label: 'UNNEST',
    kind: monaco.languages.CompletionItemKind.Function,
    insertText: 'UNNEST(${1:array_column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — expand array column into rows',
  },
  {
    label: 'DESCRIBE',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'DESCRIBE SELECT * FROM ${1:table}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — show column names and types',
  },
  {
    label: 'SUMMARIZE',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'SUMMARIZE SELECT * FROM ${1:table}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'DuckDB — profile all columns (count, nulls, min, max, mean)',
  },
];

const SQL_COMPLETIONS = [
  {
    label: 'SELECT',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'SELECT ${1:*}\nFROM ${2:table}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — basic SELECT',
  },
  {
    label: 'SELECT WHERE',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — SELECT with filter',
  },
  {
    label: 'SELECT GROUP BY',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'SELECT ${1:column}, COUNT(*) AS ${2:count}\nFROM ${3:table}\nGROUP BY ${1:column}\nORDER BY ${2:count} DESC',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — aggregate with GROUP BY',
  },
  {
    label: 'ORDER BY',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'ORDER BY ${1:column} ${2|ASC,DESC|}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — sort results',
  },
  {
    label: 'GROUP BY',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'GROUP BY ${1:column}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — group rows',
  },
  {
    label: 'HAVING',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'HAVING ${1:COUNT(*)} > ${2:0}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — filter on aggregated values',
  },
  {
    label: 'LIMIT',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'LIMIT ${1:100}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — cap row count',
  },
  {
    label: 'INNER JOIN',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'INNER JOIN ${1:table} ${2:alias} ON ${3:a}.${4:id} = ${2:alias}.${5:id}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — inner join',
  },
  {
    label: 'LEFT JOIN',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'LEFT JOIN ${1:table} ${2:alias} ON ${3:a}.${4:id} = ${2:alias}.${5:id}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — left outer join',
  },
  {
    label: 'RIGHT JOIN',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'RIGHT JOIN ${1:table} ${2:alias} ON ${3:a}.${4:id} = ${2:alias}.${5:id}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — right outer join',
  },
  {
    label: 'WITH (CTE)',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'WITH ${1:cte_name} AS (\n  ${2:SELECT * FROM table}\n)\nSELECT * FROM ${1:cte_name}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — common table expression',
  },
  {
    label: 'CASE WHEN',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:value}\n  ELSE ${3:default}\nEND',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — conditional expression',
  },
  {
    label: 'OVER PARTITION BY',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'OVER (PARTITION BY ${1:column} ORDER BY ${2:column})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — window function frame',
  },
  {
    label: 'UNION ALL',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'UNION ALL\nSELECT ${1:*} FROM ${2:table}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — combine result sets (keep duplicates)',
  },
  {
    label: 'CREATE TABLE AS',
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText: 'CREATE TABLE ${1:table_name} AS\nSELECT ${2:*} FROM ${3:source}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    detail: 'SQL — materialize query as table',
  },
];

monaco.languages.registerCompletionItemProvider('sql', {
  provideCompletionItems(model, position) {
    const range = buildCompletionRange(model, position);
    const suggestions = [...DUCKDB_COMPLETIONS, ...SQL_COMPLETIONS].map((item) => ({ ...item, range }));
    return { suggestions };
  },
});

monaco.editor.defineTheme('s3quoia', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'F4F1DE', background: '1a1b27' },
    { token: 'keyword', foreground: '74A892' },
    { token: 'keyword.sql', foreground: '74A892' },
    { token: 'predefined.sql', foreground: '74A892' },
    { token: 'string', foreground: 'cdbf94' },
    { token: 'string.sql', foreground: 'cdbf94' },
    { token: 'number', foreground: 'E07A5F' },
    { token: 'number.sql', foreground: 'E07A5F' },
    { token: 'operator', foreground: 'E07A5F' },
    { token: 'operator.sql', foreground: 'E07A5F' },
    { token: 'delimiter', foreground: 'E07A5F' },
    { token: 'comment', foreground: '565879' },
    { token: 'comment.sql', foreground: '565879' },
  ],
  colors: {
    'editor.background': '#232539',
    'editor.foreground': '#F4F1DE',
    'editorLineNumber.foreground': '#565879',
    'editorLineNumber.activeForeground': '#74A892',
    'editor.selectionBackground': '#2d2f50',
    'editor.lineHighlightBackground': '#22233a',
    'editorCursor.foreground': '#E07A5F',
    'editorIndentGuide.background1': '#2d2f50',
    'editorBracketMatch.background': '#2d2f50',
    'editorBracketMatch.border': '#4dab78',
  },
});

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: EXAMPLE_QUERIES['all-sales'],
  language: 'sql',
  theme: 's3quoia',
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  wordWrap: 'on',
});

const exampleBtns = document.querySelectorAll('[data-query]');

exampleBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const query = EXAMPLE_QUERIES[btn.dataset.query];
    if (!query) return;
    editor.setValue(query);
    exampleBtns.forEach((other) => other.classList.remove('active'));
    btn.classList.add('active');
  });
});

exampleBtns[0]?.classList.add('active');

document.getElementById('runBtn').addEventListener('click', runQuery);
window.addEventListener('resize', () => editor.layout());

const themeToggle = document.getElementById('themeToggle');
themeToggle.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾';
themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? '' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('s3q-theme', next);
  themeToggle.textContent = next === 'dark' ? '☀' : '☾';
});

runQuery();

function getConfig() {
  return {
    sql: editor.getValue(),
    endpoint: document.getElementById('endpoint').value.trim(),
    bucket: document.getElementById('bucket').value.trim(),
    accessKeyId: document.getElementById('accessKeyId').value.trim(),
    secretAccessKey: document.getElementById('secretAccessKey').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    format: document.getElementById('format').value,
  };
}

function setStatus(message, isError) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status' + (isError ? ' status-error' : '');
}

function buildCompletionRange(model, position) {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderColumnar(columns) {
  const results = document.getElementById('results');

  if (!columns || columns.length === 0) {
    results.innerHTML = '<p class="demo-results-empty">No results.</p>';
    return;
  }

  const rowCount = columns[0].fields.length;
  const headerCells = columns.map((col) => `<th>${escapeHtml(col.name)}</th>`).join('');
  const bodyRows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const cells = columns.map((col) => `<td>${escapeHtml(String(col.fields[rowIndex] ?? ''))}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  results.innerHTML = `<table class="demo-results-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderTable(rows) {
  const results = document.getElementById('results');

  if (!rows || rows.length === 0) {
    results.innerHTML = '<p class="demo-results-empty">No results.</p>';
    return;
  }

  const columns = Object.keys(rows[0]);
  const headerCells = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const bodyRows = rows
    .map((row) => {
      const cells = columns.map((col) => `<td>${escapeHtml(String(row[col] ?? ''))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  results.innerHTML = `<table class="demo-results-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

async function runQuery() {
  const runBtn = document.getElementById('runBtn');
  const start = Date.now();
  runBtn.disabled = true;
  setStatus('Running…', false);
  document.getElementById('results').innerHTML = '';

  try {
    const response = await fetch('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getConfig()),
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(`Error: ${data.error}`, true);
      return;
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    document.getElementById('cacheIndicator').classList.remove('demo-indicator--hidden');

    if (data.rows) {
      const rowLabel = data.rows.length === 1 ? 'row' : 'rows';
      setStatus(`${data.rows.length} ${rowLabel} in ${elapsed}s`, false);
      renderTable(data.rows);
    } else {
      const rowCount = data.columns.length > 0 ? data.columns[0].fields.length : 0;
      const rowLabel = rowCount === 1 ? 'row' : 'rows';
      setStatus(`${rowCount} ${rowLabel} in ${elapsed}s`, false);
      renderColumnar(data.columns);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  } finally {
    runBtn.disabled = false;
  }
}
