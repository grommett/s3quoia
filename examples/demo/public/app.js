const EXAMPLE_QUERIES = {
  'all-sales': "SELECT * FROM read_parquet('sales/**/*.parquet', union_by_name=true) ORDER BY date LIMIT 50",
  'by-product':
    "SELECT product, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total\nFROM read_parquet('sales/**/*.parquet', union_by_name=true)\nGROUP BY product\nORDER BY total DESC",
  'by-region':
    "SELECT region, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total\nFROM read_parquet('sales/**/*.parquet', union_by_name=true)\nGROUP BY region\nORDER BY total DESC",
  products: "SELECT * FROM read_parquet('products/catalog.parquet') ORDER BY price",
  join: "SELECT s.date, s.product, s.amount, p.category, p.price AS list_price\nFROM read_parquet('sales/**/*.parquet', union_by_name=true) s\nJOIN read_parquet('products/catalog.parquet') p ON s.product = p.name\nORDER BY s.date\nLIMIT 20",
};

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: EXAMPLE_QUERIES['all-sales'],
  language: 'sql',
  theme: 'vs-dark',
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'off',
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  wordWrap: 'on',
});

document.querySelectorAll('.demo-example-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const query = EXAMPLE_QUERIES[btn.dataset.query];
    if (query) editor.setValue(query);
  });
});

document.getElementById('runBtn').addEventListener('click', runQuery);

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
  status.className = 'demo-status' + (isError ? ' error' : '');
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
