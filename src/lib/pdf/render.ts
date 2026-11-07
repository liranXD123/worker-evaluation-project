import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "puppeteer-core";

/**
 * הפקת PDF מ-HTML באמצעות Chromium (עברית ו-RTL מלאים).
 *
 * איתור הדפדפן:
 *  1. Vercel / AWS Lambda → @sparticuz/chromium (Chromium מותאם לסביבת serverless)
 *  2. CHROME_EXECUTABLE_PATH אם הוגדר (למשל ב-Docker / Azure App Service)
 *  3. Edge / Chrome / Chromium מותקנים במחשב (Windows, macOS, Linux)
 *
 * אבטחה: כל בקשת רשת מהעמוד נחסמת – ה-HTML עצמאי לחלוטין (גופנים מוטמעים כ-data URI).
 */

function localBrowserCandidates(): string[] {
  const env = process.env;
  switch (process.platform) {
    case "win32": {
      const roots = [env["PROGRAMFILES(X86)"], env.PROGRAMFILES, env.LOCALAPPDATA].filter((root): root is string => Boolean(root));
      return roots.flatMap((root) => [
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      ]);
    }
    case "darwin":
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ];
    default:
      return ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/microsoft-edge"];
  }
}

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");

  if (isServerless()) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH || localBrowserCandidates().find((candidate) => existsSync(candidate));
  if (!executablePath) {
    throw new Error(
      "לא נמצא דפדפן Chromium/Edge/Chrome להפקת PDF. התקינו Chrome או Edge, או הגדירו CHROME_EXECUTABLE_PATH.",
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
}

export async function renderPdf(html: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.url().startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#6b7280;text-align:center;font-family:Arial,sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

// -----------------------------------------------------------------------------
// גופן עברי מוטמע (Heebo, רישיון OFL) – כדי שהעברית תוצג גם בשרתים ללא גופנים עבריים
// -----------------------------------------------------------------------------

let cachedFontCss: string | null = null;

const FONT_FILES: readonly { file: string; weight: number; range: string }[] = [
  { file: "heebo-hebrew-400-normal.woff2", weight: 400, range: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" },
  { file: "heebo-hebrew-700-normal.woff2", weight: 700, range: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" },
  { file: "heebo-latin-400-normal.woff2", weight: 400, range: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  { file: "heebo-latin-700-normal.woff2", weight: 700, range: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
];

export async function embeddedFontCss(): Promise<string> {
  if (cachedFontCss) return cachedFontCss;
  const directory = path.join(process.cwd(), "node_modules", "@fontsource", "heebo", "files");
  const faces = await Promise.all(
    FONT_FILES.map(async ({ file, weight, range }) => {
      const data = await readFile(path.join(directory, file));
      return `@font-face{font-family:"Heebo";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2");unicode-range:${range};}`;
    }),
  );
  cachedFontCss = faces.join("\n");
  return cachedFontCss;
}
