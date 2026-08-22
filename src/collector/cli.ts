import { globalCollector } from "./engine";
import { formatManilaTime } from "../utils/philippineTime";

async function main() {
  console.log("=================================================");
  console.log("🇵🇭 ClassStatus NCR - Automated Collector CLI");
  console.log(`Current Manila Time: ${formatManilaTime()}`);
  console.log("=================================================\n");

  console.log("Running collection sweep across all monitored sources...");
  const summary = await globalCollector.runSweep();

  console.log("\n---------------- SUMMARY ----------------");
  console.log(`Run ID:                     ${summary.runId}`);
  console.log(`Sources Processed:          ${summary.sourcesProcessed}`);
  console.log(`Sources Succeeded:          ${summary.sourcesSucceeded}`);
  console.log(`Sources Failed:             ${summary.sourcesFailed}`);
  console.log(`Announcements Discovered:   ${summary.announcementsDiscovered}`);
  console.log(`Announcements Validated:    ${summary.announcementsValidated}`);
  console.log(`Announcements Published:    ${summary.announcementsPublished}`);
  console.log(`Announcements Rejected:     ${summary.announcementsRejected}`);
  console.log(`Announcements Held:         ${summary.announcementsHeld}`);
  summary.sourceHealth.forEach((source) => {
    console.log(`Source ${source.sourceId}: ${source.health} (${source.candidateCount} candidate(s))`);
  });
  console.log("-----------------------------------------\n");

  console.log("Recent Execution Logs:");
  summary.logs.slice(-8).forEach((l) => {
    const symbol = l.level === "success" ? "✅" : l.level === "error" ? "❌" : l.level === "warn" ? "⚠️" : "ℹ️";
    console.log(`${symbol} [${l.timestamp.slice(11, 19)}] [${l.sourceName}] ${l.message}`);
  });

  console.log("\nCollection complete! Data persisted to data/suspensions.json\n");
}

main().catch((err) => {
  console.error("Fatal error during collection:", err);
  process.exit(1);
});
