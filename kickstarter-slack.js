const fs = require("fs");

const KICKSTARTER_STATS_URL = process.env.KICKSTARTER_STATS_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const KICKSTARTER_EUR_TO_USD_RATE = process.env.KICKSTARTER_EUR_TO_USD_RATE;
const DEFAULT_EUR_TO_USD_RATE = 1.1523464426;

if (!KICKSTARTER_STATS_URL) throw new Error("Falta KICKSTARTER_STATS_URL");
if (!SLACK_WEBHOOK_URL) throw new Error("Falta SLACK_WEBHOOK_URL");

async function sendSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`Slack error: ${res.status} ${await res.text()}`);
}

function formatCurrency(value, currency, locale = currency === "USD" ? "en-US" : "es-ES") {
  return value.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function formatUSD(value) {
  return formatCurrency(value, "USD");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getUsdRate(project, currency, pledged) {
  const usdPledged = toNumber(project.usd_pledged);

  if (usdPledged !== null && pledged > 0) {
    return usdPledged / pledged;
  }

  const staticUsdRate = toNumber(project.static_usd_rate);

  if (staticUsdRate !== null) {
    return staticUsdRate;
  }

  if (currency === "USD") {
    return 1;
  }

  if (currency === "EUR") {
    return toNumber(KICKSTARTER_EUR_TO_USD_RATE) || DEFAULT_EUR_TO_USD_RATE;
  }

  const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=USD`);

  if (!res.ok) {
    throw new Error(`FX error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rate = toNumber(data.rates?.USD);

  if (rate === null) {
    throw new Error(`No se encontró tipo de cambio ${currency}→USD: ${JSON.stringify(data)}`);
  }

  return rate;
}

async function main() {
  const ksRes = await fetch(KICKSTARTER_STATS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!ksRes.ok) {
    throw new Error(`Kickstarter error: ${ksRes.status} ${await ksRes.text()}`);
  }

  const data = await ksRes.json();
  const project = data.project || data;

  const pledged = Number(project.pledged);
  const backers = Number(project.backers_count);
  const currency = project.currency || "EUR";
  const usdRate = await getUsdRate(project, currency, pledged);
  const pledgedUsd = pledged * usdRate;

  const previous = fs.existsSync("state.json")
    ? JSON.parse(fs.readFileSync("state.json", "utf8"))
    : { pledged: 0, backers: 0 };

  const pledgedDelta = pledged - Number(previous.pledged || 0);
  const pledgedDeltaUsd = pledgedDelta * usdRate;
  const backersDelta = backers - Number(previous.backers || 0);

  fs.writeFileSync(
    "state.json",
    JSON.stringify({ pledged, backers }, null, 2)
  );

  const message = `
🚀 *Kickstarter Update — MYHIXEL Sync Pump*

📈 Cambio desde el último reporte:
• ${pledgedDelta >= 0 ? "+" : ""}${formatCurrency(pledgedDelta, currency)} (${pledgedDeltaUsd >= 0 ? "+" : ""}${formatUSD(pledgedDeltaUsd)})
• ${backersDelta >= 0 ? "+" : ""}${backersDelta} backers

💰 Total: *${formatCurrency(pledged, currency)} (${formatUSD(pledgedUsd)})*
👥 Total backers: *${backers}*

🔗 https://www.kickstarter.com/projects/myhixel/myhixel-sync-pump-stronger-firmness-and-measurable-gains
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
