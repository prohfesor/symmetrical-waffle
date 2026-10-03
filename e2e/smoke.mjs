// End-to-end smoke test: boots the real server (production mode, dev sign-in, temp database) serving the
// built UI, then drives it in Chromium. Run `npm run build` first, then `npm run test:e2e`.
// Set CHROMIUM_PATH to use a specific browser binary instead of Playwright's own.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    }).on("error", reject);
  });
}

const port = await freePort();
const base = `http://localhost:${port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pcad-e2e-"));
const server = spawn(process.execPath, [path.join(root, "packages/server/dist/index.js")], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), PUBLIC_SERVER_URL: base, DB_PATH: path.join(tmp, "e2e.sqlite") },
  stdio: ["ignore", "pipe", "inherit"],
});
let failed = false;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const problems = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  const dialogs = [];
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.accept(); });

  await page.goto(base);
  await page.waitForSelector("canvas");
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];

  // Print dialog: the sample at 5:1 on A4 needs several tiles; exporting downloads a real multi-page PDF.
  await page.getByRole("button", { name: /Print \/ Export PDF/ }).click();
  await page.locator(".print-dialog select").nth(2).selectOption("5:1");
  const summary = await page.locator(".print-summary").innerText();
  const sheets = Number(summary.match(/= (\d+) sheet/)?.[1] ?? 0);
  check("print dialog splits the drawing into several sheets at 5:1", sheets > 1);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".print-dialog .primary").click()]);
  const pdfPath = path.join(tmp, "out.pdf");
  await download.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  check("exported file is a PDF", pdf.subarray(0, 5).toString() === "%PDF-");
  check("PDF has one page per sheet plus an index", (await PDFDocument.load(pdf)).getPageCount() === sheets + 1);
  await page.locator(".print-dialog").waitFor({ state: "detached" });

  // Tool shortcut by physical key, draw a line with two clicks.
  check("starts clean (no unsaved dot)", (await page.locator(".unsaved-dot").count()) === 0);
  await page.keyboard.press("l");
  await page.mouse.click(...at(0.2, 0.7));
  await page.mouse.click(...at(0.5, 0.75));
  await page.keyboard.press("s");
  await page.mouse.click(...at(0.35, 0.725));
  check("drew a line and selected it", /line/i.test(await page.locator(".property-panel h3").innerText()));
  check("edit marks project unsaved", (await page.locator(".unsaved-dot").count()) === 1);

  // Wheel zoom must not log passive-listener errors, and must change nothing on the page scroll.
  await page.mouse.move(...at(0.5, 0.5));
  await page.mouse.wheel(0, -300);
  await page.mouse.wheel(0, 600);

  // Delete key removes the selection.
  await page.keyboard.press("Delete");
  check("Delete removes selected entity", /Select an entity/.test(await page.locator(".property-panel").innerText()));

  // Mirror: pick the plate, confirm with Enter, drag out a vertical axis to its right; copies are computed.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2; // world (60, 40); zoom 4 px/mm
  await page.keyboard.press("m");
  await page.mouse.move(cx, cy + 160);
  await page.mouse.click(cx, cy + 160); // bottom edge of the sample rectangle
  await page.keyboard.press("Enter");
  await page.mouse.move(cx + 280, cy + 160);
  await page.mouse.click(cx + 280, cy + 160);
  await page.mouse.move(cx + 280, cy + 120);
  await page.mouse.click(cx + 280, cy + 120);
  await page.keyboard.press("s");
  await page.mouse.move(cx + 280, cy + 50);
  await page.mouse.click(cx + 280, cy + 50); // on the (infinite) dash-dot axis
  check("mirror axis is selectable and shows mirror properties", /mirror/i.test(await page.locator(".property-panel h3").innerText()));
  check("mirror lists its source", /rect/.test(await page.locator(".property-panel").innerText()));
  await page.screenshot({ path: path.join(tmp, "mirror.png") });
  if (process.env.E2E_SCREENSHOT_DIR) fs.copyFileSync(path.join(tmp, "mirror.png"), path.join(process.env.E2E_SCREENSHOT_DIR, "mirror.png"));

  // New with unsaved changes asks first.
  dialogs.length = 0;
  await page.getByRole("button", { name: "New" }).click();
  check("New asks to confirm discarding", dialogs.some((d) => /unsaved changes/.test(d)));
  check("New cleared the unsaved flag", (await page.locator(".unsaved-dot").count()) === 0);
  check("New reset params", /params\.txt/.test(await page.locator(".params-panel textarea").inputValue()));
  dialogs.length = 0;
  await page.getByRole("button", { name: "New" }).click();
  check("New on a clean project doesn't nag", dialogs.length === 0);

  // Sign in (dev stub), save to cloud, list, reopen.
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByRole("button", { name: "Dev Sign In" }).click();
  await page.waitForSelector(".cloud-user");
  check("signed in, redirected to same origin", page.url().startsWith(base));
  await page.locator(".project-title-input").fill("E2E Plate");
  await page.getByRole("button", { name: /Save to Cloud/ }).click();
  await page.getByRole("button", { name: /Update Cloud Copy/ }).waitFor();
  check("cloud save clears unsaved dot", (await page.locator(".unsaved-dot").count()) === 0);
  await page.getByRole("button", { name: /Projects/ }).first().click();
  await page.waitForSelector(".project-list li");
  check("project listed", /E2E Plate/.test(await page.locator(".project-list").innerText()));

  // Rename and update: the cloud title must follow.
  await page.locator(".project-title-input").fill("E2E Plate v2");
  await page.getByRole("button", { name: /Update Cloud Copy/ }).click();
  await page.waitForFunction(() => /v2/.test(document.querySelector(".project-list")?.textContent ?? ""));
  check("renaming + update renames the cloud copy", true);

  // Make public, copy link -> open as anonymous in a fresh context.
  await page.locator(".visibility-toggle select").selectOption("public");
  await page.waitForFunction(() => /public/.test(document.querySelector(".project-list")?.textContent ?? ""));
  const id = await page.evaluate(async () => (await (await fetch("/api/drawings")).json()).drawings[0].id);
  const anon = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await anon.goto(`${base}/#/d/${id}`);
  await anon.getByText(/Viewing a shared project/).waitFor();
  check("anonymous visitor sees the shared drawing read-only-ish", (await anon.locator(".project-title-input").inputValue()) === "E2E Plate v2");

  // Sample load/error: private -> anonymous gets a visible error, not an alert.
  await page.locator(".visibility-toggle select").selectOption("private");
  await page.waitForFunction(() => /private/.test(document.querySelector(".project-list")?.textContent ?? ""));
  const anon2 = await browser.newPage();
  await anon2.goto(`${base}/#/d/${id}`);
  await anon2.locator(".issues-panel").waitFor();
  check("private link shows an inline error", /Could not open shared drawing/.test(await anon2.locator(".issues-panel").innerText()));


  check("no console errors/warnings", problems.length === 0);
  if (problems.length) console.log(problems);

} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser?.close();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
