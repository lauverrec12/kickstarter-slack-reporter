const KICKSTARTER_STATS_URL = process.env.KICKSTARTER_STATS_URL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function sendSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`Slack error: ${res.status} ${await res.text()}`);
}

async function main() {
  const res = await fetch(KICKSTARTER_STATS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Kickstarter error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();

  const project = data.project || data;
  const pledged = Number(project.pledged);
  const backers = project.backers_count;
  const state = project.state;

  const pledgedFormatted = pledged.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const message = `
🚀 *Resumen Kickstarter — MYHIXEL Sync Pump*

💰 Contribuido total: *${pledgedFormatted}*
👥 Backers: *${backers}*
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