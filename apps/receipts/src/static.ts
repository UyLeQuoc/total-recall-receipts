/**
 * Serves the built web (ADR-0064) from `web/dist` at the paths the bot already links to (`/g/:id`,
 * `/p/:pick`, …): a file when one matches, the SPA's `index.html` for any other page. Without a build,
 * it says how to start the web.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

export const WEB_DIST = fileURLToPath(new URL("../web/dist", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function serveWeb(app: Hono, dist = WEB_DIST) {
  const root = resolve(dist);
  app.get("*", (c) => {
    const path = decodeURIComponent(new URL(c.req.url).pathname);
    if (path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
    const index = join(root, "index.html");
    if (!existsSync(index)) {
      return c.text(
        "Receipts' web isn't built. Run `bun run build` in apps/receipts, or `bun run dev:web` and open http://localhost:5181.",
        404,
      );
    }
    const file = resolve(root, `.${normalize(path)}`);
    if (file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile()) {
      return c.body(readFileSync(file), 200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
    }
    if (extname(path)) return c.notFound();
    return c.body(readFileSync(index), 200, {
      "content-type": TYPES[".html"] as string,
      "cache-control": "no-cache",
    });
  });
}
