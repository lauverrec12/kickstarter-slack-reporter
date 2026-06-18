const { chromium } = require("@playwright/test");

const KICKSTARTER_URL = process.env.KICKSTARTER_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function sendSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Slack error: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  if (!KICKSTARTER_URL || !SLACK_WEBHOOK_URL) {
    throw new Error("Faltan KICKSTARTER_URL o SLACK_WEBHOOK_URL");
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1440, height: 1200 },
  });

  await page.goto(KICKSTARTER_URL, {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  const text = await page.locator("body").innerText();

  await browser.close();

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
  await sendSlack(`⚠️ Error leyendo Kickstarter: ${error.message}`);
  throw error;
});