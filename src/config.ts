import { readFileSync } from "node:fs";
import { parse } from "yaml";

export interface Upstream {
  name: string;
  prefix: string;
  target: string;
  headers?: Record<string, string>;
}

interface ConfigFile {
  upstreams: Upstream[];
}

/** Replace ${VAR} with process.env.VAR. Throws if any required env is missing. */
function resolveEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return v;
  });
}

export function loadConfig(path: string): Upstream[] {
  const raw = readFileSync(path, "utf8");
  const parsed = parse(raw) as ConfigFile;

  if (!parsed.upstreams?.length) {
    throw new Error(`No upstreams defined in ${path}`);
  }

  return parsed.upstreams.map((u) => ({
    ...u,
    target: resolveEnv(u.target),
    headers: u.headers
      ? Object.fromEntries(
          Object.entries(u.headers).map(([k, v]) => [k, resolveEnv(v)]),
        )
      : undefined,
  }));
}
