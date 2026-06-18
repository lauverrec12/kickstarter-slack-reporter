const fs = require("fs");

const KICKSTARTER_STATS_URL = process.env.KICKSTARTER_STATS_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

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

function formatEUR(value) {
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function formatUSD(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

async function getEurToUsdRate() {
  const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD");

  if (!res.ok) {
    throw new Error(`FX error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const rate = data.rates?.USD;

  if (!rate) {
    throw new Error(`No se encontró tipo de cambio EUR→USD: ${JSON.stringify(data)}`);
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
  const state = project.state || "unknown";

  const previous = fs.existsSync("state.json")
    ? JSON.parse(fs.readFileSync("state.json", "utf8"))
    : { pledged: 0, backers: 0 };

  const pledgedDelta = pledged - Number(previous.pledged || 0);
  const backersDelta = backers - Number(previous.backers || 0);

  fs.writeFileSync(
    "state.json",
    JSON.stringify({ pledged, backers }, null, 2)
  );

  const eurToUsd = await getEurToUsdRate();

  const pledgedUsd = pledged * eurToUsd;
  const pledgedDeltaUsd = pledgedDelta * eurToUsd;

  const message = `
🚀 *Kickstarter Update — MYHIXEL Sync Pump*

📈 Cambio desde el último reporte:
• ${pledgedDelta >= 0 ? "+" : ""}${formatEUR(pledgedDelta)} (${pledgedDelta >= 0 ? "+" : ""}${formatUSD(pledgedDeltaUsd)})
• ${backersDelta >= 0 ? "+" : ""}${backersDelta} backers

💰 Total: *${formatEUR(pledged)} (${formatUSD(pledgedUsd)})*
👥 Total backers: *${backers}*
📌 Estado: *${state}*

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