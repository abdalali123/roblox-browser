// ============================================================
//  ROBLOX BROWSER PROXY — Vercel Serverless Function
//  /api/browse
//  Runs real Chromium via Puppeteer, returns screenshot URL
// ============================================================

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { put }   = require("@vercel/blob");

// ── Constants ───────────────────────────────────────────────
const BROWSER_W  = 1280;
const BROWSER_H  = 720;
const NAV_TIMEOUT = 30_000;   // ms
const SETTLE_MS   = 2_500;    // let JS finish rendering
const JPEG_Q      = 82;       // screenshot quality

// ── CORS helper ─────────────────────────────────────────────
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST is allowed" });

  // ── Parse body ──────────────────────────────────────────
  const {
    url,
    action   = "navigate",   // navigate | click | type | key | scroll
    x,                        // click / type target X
    y,                        // click / type target Y
    text,                     // text to type or key to press
    scrollY  = 0,             // scroll delta in px
    cookies  = [],            // session cookies from previous response
  } = req.body ?? {};

  if (!url || typeof url !== "string")
    return res.status(400).json({ error: "url is required" });

  // Normalise URL
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;

  let browser;
  try {
    // ── Launch Chromium ────────────────────────────────────
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      defaultViewport: { width: BROWSER_W, height: BROWSER_H },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Stealth: spoof navigator properties
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      window.chrome = { runtime: {} };
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/124.0.0.0 Safari/537.36"
    );

    // Restore session cookies
    if (Array.isArray(cookies) && cookies.length > 0) {
      // Filter to only valid cookie fields Puppeteer accepts
      const clean = cookies.map(({ name, value, domain, path, httpOnly, secure, sameSite }) => ({
        name, value, domain, path: path || "/", httpOnly: !!httpOnly, secure: !!secure,
        ...(sameSite ? { sameSite } : {}),
      }));
      await page.setCookie(...clean);
    }

    // ── Navigate ───────────────────────────────────────────
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout:   NAV_TIMEOUT,
    });
    await wait(SETTLE_MS);

    // ── Perform Action ─────────────────────────────────────
    switch (action) {
      case "click":
        if (x !== undefined && y !== undefined) {
          await page.mouse.click(Number(x), Number(y));
          await wait(2000);
        }
        break;

      case "type":
        if (x !== undefined && y !== undefined) {
          await page.mouse.click(Number(x), Number(y));
          await wait(300);
        }
        if (text) {
          await page.keyboard.type(String(text), { delay: 40 });
          await wait(500);
        }
        break;

      case "key":
        // e.g. "Enter", "Escape", "ArrowDown"
        if (text) {
          await page.keyboard.press(String(text));
          await wait(1000);
        }
        break;

      case "scroll":
        await page.evaluate((dy) => window.scrollBy(0, dy), Number(scrollY));
        await wait(600);
        break;

      case "navigate":
      default:
        // Already navigated above
        break;
    }

    // ── Screenshot ─────────────────────────────────────────
    const screenshotBuf = await page.screenshot({
      type:     "jpeg",
      quality:  JPEG_Q,
      encoding: "binary",
    });

    // ── Collect state ──────────────────────────────────────
    const currentUrl  = page.url();
    const title       = await page.title();
    const newCookies  = await page.cookies();

    // ── Upload screenshot to Vercel Blob ───────────────────
    // Blob stores image publicly; Roblox ImageLabel loads it via HTTPS URL
    const blob = await put(
      `roblox-browser/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      Buffer.from(screenshotBuf, "binary"),
      {
        access:      "public",
        contentType: "image/jpeg",
      }
    );

    // ── Respond ────────────────────────────────────────────
    return res.status(200).json({
      ok:            true,
      screenshotUrl: blob.url,
      url:           currentUrl,
      title,
      width:         BROWSER_W,
      height:        BROWSER_H,
      // Return a clean subset of cookies so the Roblox script
      // can send them back on the next request
      cookies: newCookies.map(({ name, value, domain, path, httpOnly, secure }) => ({
        name, value, domain, path, httpOnly, secure,
      })),
    });

  } catch (err) {
    console.error("[browse] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
