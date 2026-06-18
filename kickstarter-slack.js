const { chromium } = require("@playwright/test");

const KICKSTARTER_URL = process.env.KICKSTARTER_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const KICKSTARTER_COOKIES = process.env.KICKSTARTER_COOKIES;

async function sendSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`Slack error: ${res.status} ${await res.text()}`);
}

function normalizeCookies(rawCookies) {
  const cookies = JSON.parse(rawCookies);

  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || ".kickstarter.com",
    path: cookie.path || "/",
    expires: cookie.expirationDate || cookie.expires || -1,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    sameSite: cookie.sameSite === "no_restriction" ? "None" : cookie.sameSite || "Lax",
  }));
}

async function main() {
  if (!KICKSTARTER_URL || !SLACK_WEBHOOK_URL) {
    throw new Error("Faltan KICKSTARTER_URL o SLACK_WEBHOOK_URL");
  }

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  if (KICKSTARTER_COOKIES) {
    await context.addCookies(normalizeCookies(KICKSTARTER_COOKIES));
  }

  const page = await context.newPage();

  await page.goto(KICKSTARTER_URL, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  await page.waitForTimeout(10000);

  const text = await page.locator("body").innerText();

  console.log("PAGE TEXT START");
  console.log(text.slice(0, 3000));
  console.log("PAGE TEXT END");

  await browser.close();

  if (/security verification|Cloudflare|not a bot/i.test(text)) {
    await sendSlack("⚠️ Kickstarter sigue mostrando Cloudflare. Revisa o renueva las cookies.");
    throw new Error("Cloudflare verification page");
  }

  const amountMatch = text.match(/([€$£]\s?[\d,.]+)\s*(contributed|pledged|contribuido)/i);
  const backersMatch = text.match(/([\d,.]+)\s*(backers|contribuidores)/i);
  const fundedMatch = text.match(/(\d+)%\s*(funded|financiado)/i);

  const amount = amountMatch ? amountMatch[1] : "No encontrado";
  const backers = backersMatch ? backersMatch[1] : "No encontrado";
  const funded = fundedMatch ? `${fundedMatch[1]}%` : "No encontrado";

  const message = `
🚀 *Resumen Kickstarter — MYHIXEL Sync Pump*

💰 Contribuido total: *${amount}*
👥 Backers: *${backers}*
🎯 Financiación: *${funded}*

🔗 ${KICKSTARTER_URL}
`;

  await sendSlack(message);
}

main().catch(async (error) => {
  console.error(error);
  if (SLACK_WEBHOOK_URL) {
    await sendSlack(`⚠️ Error leyendo Kickstarter: ${error.message}`);
  }
  process.exit(1);
});