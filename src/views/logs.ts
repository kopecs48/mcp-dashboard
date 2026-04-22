import type { LogRow } from "../db.js";

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function statusClass(status: number): string {
  if (status >= 500) return "s5";
  if (status >= 400) return "s4";
  if (status >= 300) return "s3";
  if (status >= 200) return "s2";
  return "s0";
}

export function renderLogs(rows: LogRow[], serverNames: string[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td class="ts">${escape(r.ts)}</td>
      <td><span class="pill">${escape(r.server_name)}</span></td>
      <td>${escape(r.method ?? "-")}</td>
      <td>${escape(r.tool_name ?? "-")}</td>
      <td class="${statusClass(r.status)}">${r.status}</td>
      <td class="num">${r.latency_ms}ms</td>
      <td class="body" title="${escape(r.request_body)}">${escape(truncate(r.request_body, 80))}</td>
      <td class="body err">${escape(r.error ?? "")}</td>
    </tr>`,
    )
    .join("");

  const filterOptions = serverNames
    .map((n) => `<option value="${escape(n)}">${escape(n)}</option>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>mcp-logproxy</title>
  <meta http-equiv="refresh" content="5">
  <style>
    body { font: 13px/1.4 ui-monospace, monospace; background: #1e1e2e; color: #cdd6f4; margin: 0; padding: 16px; }
    h1 { font-size: 16px; margin: 0 0 12px; color: #cba6f7; }
    .controls { margin-bottom: 12px; }
    .controls a, .controls select { color: #89b4fa; background: #313244; border: 1px solid #45475a; padding: 4px 8px; margin-right: 6px; text-decoration: none; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; background: #313244; color: #a6adc8; font-weight: normal; border-bottom: 1px solid #45475a; position: sticky; top: 0; }
    td { padding: 4px 8px; border-bottom: 1px solid #313244; vertical-align: top; }
    .ts { color: #7f849c; white-space: nowrap; }
    .pill { background: #45475a; padding: 1px 6px; border-radius: 3px; color: #f9e2af; }
    .num { text-align: right; color: #94e2d5; }
    .body { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a6adc8; }
    .body.err { color: #f38ba8; }
    .s2 { color: #a6e3a1; }
    .s3 { color: #f9e2af; }
    .s4 { color: #fab387; }
    .s5 { color: #f38ba8; }
    .s0 { color: #6c7086; }
    .empty { padding: 32px; text-align: center; color: #6c7086; }
  </style>
</head>
<body>
  <h1>mcp-logproxy — recent calls</h1>
  <div class="controls">
    <a href="/logs">all</a>
    ${serverNames.map((n) => `<a href="/logs?server=${escape(n)}">${escape(n)}</a>`).join("")}
    <span style="color:#6c7086; margin-left: 12px;">auto-refresh 5s · ${rows.length} rows</span>
  </div>
  ${
    rows.length === 0
      ? `<div class="empty">No calls logged yet. Point OpenCode at this proxy and make a request.</div>`
      : `<table>
    <thead>
      <tr>
        <th>time</th><th>server</th><th>method</th><th>tool</th>
        <th>status</th><th>latency</th><th>request</th><th>error</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`
  }
</body>
</html>`;
}
