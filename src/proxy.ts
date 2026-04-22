import type { FastifyReply, FastifyRequest } from "fastify";
import { request as undiciRequest } from "undici";
import type Database from "better-sqlite3";
import { insertLog } from "./db.js";
import type { Upstream } from "./config.js";

/**
 * Headers we should never forward upstream (hop-by-hop or host-specific).
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "keep-alive",
]);

/**
 * Try to pull the JSON-RPC method name and (if it's a tools/call) the tool name
 * out of the request body. MCP uses JSON-RPC 2.0, so the shape is:
 *   { "jsonrpc": "2.0", "id": N, "method": "tools/call",
 *     "params": { "name": "toolname", "arguments": {...} } }
 */
function extractRpcInfo(body: string | null): {
  method: string | null;
  tool: string | null;
} {
  if (!body) return { method: null, tool: null };
  try {
    const parsed = JSON.parse(body);
    const method = typeof parsed.method === "string" ? parsed.method : null;
    const tool =
      method === "tools/call" && typeof parsed.params?.name === "string"
        ? parsed.params.name
        : null;
    return { method, tool };
  } catch {
    return { method: null, tool: null };
  }
}

export function makeProxyHandler(db: Database.Database, upstream: Upstream) {
  return async function handler(req: FastifyRequest, reply: FastifyReply) {
    const start = Date.now();

    // Strip the route prefix so we forward the remaining path to upstream.
    const suffix = req.url.slice(upstream.prefix.length) || "/";
    const targetUrl = upstream.target.replace(/\/$/, "") + suffix;

    // Build forwarded headers: copy client headers, drop hop-by-hop,
    // then overlay upstream's configured headers (auth, etc).
    const forwardedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (STRIPPED_REQUEST_HEADERS.has(k.toLowerCase())) continue;
      forwardedHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
    }
    if (upstream.headers) {
      for (const [k, v] of Object.entries(upstream.headers)) {
        forwardedHeaders[k] = v;
      }
    }

    // Body: Fastify parses JSON by default, but we want the raw bytes for
    // faithful forwarding. req.body is the parsed object; re-stringify.
    let bodyToSend: string | undefined;
    let bodyForLog: string | null = null;
    if (req.body !== undefined && req.body !== null) {
      bodyToSend =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      bodyForLog = bodyToSend;
    }

    const { method: rpcMethod, tool: rpcTool } = extractRpcInfo(bodyForLog);

    let status = 0;
    let responseBody: string | null = null;
    let errorMsg: string | null = null;

    try {
      const upstreamRes = await undiciRequest(targetUrl, {
        method: req.method as any,
        headers: forwardedHeaders,
        body: bodyToSend,
      });

      status = upstreamRes.statusCode;
      responseBody = await upstreamRes.body.text();

      // Mirror response headers back to the client.
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        if (v === undefined) continue;
        if (STRIPPED_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
        reply.header(k, v as string | string[]);
      }
      reply.code(status).send(responseBody);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      status = 502;
      reply.code(502).send({ error: "upstream_unreachable", detail: errorMsg });
    } finally {
      const latency = Date.now() - start;
      try {
        insertLog(db, {
          server_name: upstream.name,
          method: rpcMethod,
          tool_name: rpcTool,
          status,
          latency_ms: latency,
          request_body: bodyForLog,
          response_body: responseBody,
          error: errorMsg,
        });
      } catch (logErr) {
        // Never let logging failures poison the proxy response path.
        req.log.error({ err: logErr }, "failed to write log row");
      }
    }
  };
}
