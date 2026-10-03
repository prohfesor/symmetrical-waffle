// Static-hosting smoke test: serves the server-less build (`npm run build:pages`) from a sub-path with
// nothing behind it -- like GitHub Pages -- and checks that saving, autosave and share links work.
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "packages/ui/dist-pages");
const PREFIX = "/symmetrical-waffle/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith(PREFIX)) return void res.writeHead(404).end("not found"); // like Pages: no API, nothing outside the repo path
  const rel = url.pathname.slice(PREFIX.length) || "index.html";
  const file = path.join(dist, path.normalize(rel));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;

let failed = false;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
};

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const problems = [];
  const apiCalls = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => { if (new URL(r.url()).pathname.includes("/api/")) apiCalls.push(r.url()); });
  page.on("dialog", (d) => d.accept());

  await page.goto(base);
  await page.waitForSelector("canvas");
  check("loads from a sub-path with no server", (await page.title()) === "Parametric CAD");
  check("no sign-in UI in the static flavour", (await page.getByRole("button", { name: "Sign in" }).count()) === 0);
  check("offers saving in the browser", (await page.getByRole("button", { name: /Save in Browser/ }).count()) === 1);
  check("never calls an API", apiCalls.length === 0);

  // Autosave: edit, reload, the work is back and still marked unsaved.
  await page.locator(".project-title-input").fill("Static Plate");
  await page.locator(".params-panel textarea").fill("width = 150\nheight = 60\nhole_d = 8\nhole_margin = 15\n");
  await page.waitForTimeout(900); // autosave debounce
  await page.reload();
  await page.waitForSelector("canvas");
  check("autosave restores the title after a reload", (await page.locator(".project-title-input").inputValue()) === "Static Plate");
  check("autosave restores the params", /width = 150/.test(await page.locator(".params-panel textarea").inputValue()));
  check("restored work is still marked unsaved", (await page.locator(".unsaved-dot").count()) === 1);

  // Save in the browser; after that a reload needs no autosave and the project is listed.
  await page.getByRole("button", { name: /Save in Browser/ }).click();
  await page.getByRole("button", { name: /Update Saved Copy/ }).waitFor();
  check("saving clears the unsaved mark", (await page.locator(".unsaved-dot").count()) === 0);
  await page.reload();
  await page.waitForSelector("canvas");
  check("after saving, a reload starts from the sample again (autosave cleared)", (await page.locator(".project-title-input").inputValue()) === "L-Bracket Plate");
  await page.getByRole("button", { name: /Projects/ }).first().click();
  await page.waitForSelector(".project-list li");
  check("the saved project is listed", /Static Plate/.test(await page.locator(".project-list").innerText()));
  await page.locator(".project-list-main").first().click();
  await page.waitForFunction(() => document.querySelector(".project-title-input")?.value === "Static Plate");
  check("opening it restores the params", /width = 150/.test(await page.locator(".params-panel textarea").inputValue()));

  // Share link carries the drawing; a different browser profile (fresh context) opens it.
  await page.getByRole("button", { name: "Share link" }).click();
  await page.getByRole("button", { name: "Link copied!" }).waitFor();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  check("share link is a snapshot link on the same path", link.startsWith(base + "#/s/"));
  const other = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
  const otherProblems = [];
  other.on("console", (m) => { if (["error", "warning"].includes(m.type())) otherProblems.push(m.text()); });
  await other.goto(link);
  await other.waitForFunction(() => document.querySelector(".project-title-input")?.value === "Static Plate");
  check("another browser opens the shared drawing with its params", /width = 150/.test(await other.locator(".params-panel textarea").inputValue()));
  check("the opened copy is not marked unsaved and not bound to the sender's saved copy", (await other.locator(".unsaved-dot").count()) === 0 && (await other.getByRole("button", { name: /Save in Browser/ }).count()) === 1);

  // A damaged link says so.
  const bad = await (await browser.newContext()).newPage();
  await bad.goto(base + "#/s/AAAA");
  await bad.locator(".issues-panel").waitFor();
  check("a damaged link shows an inline error", /damaged|incomplete/.test(await bad.locator(".issues-panel").innerText()));

  check("no console errors/warnings", problems.length === 0 && otherProblems.length === 0);
  if (problems.length || otherProblems.length) console.log(problems, otherProblems);
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.E2E_SCREENSHOT_DIR, "pages.png") });
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser?.close();
  server.close();
}
process.exit(failed ? 1 : 0);
