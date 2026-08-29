import { sql as pg } from "@/db/client";
import { sweepAll } from "@/services/sweep";

/**
 * The scheduled run, as a job rather than an HTTP call.
 *
 * `/api/cron/sweep` still exists for platforms whose scheduler can only make a
 * request, but where the scheduler can run a process — Railway's cron, a
 * container, a laptop — this is the better shape: it does not depend on the web
 * tier being healthy, needs no shared secret, and cannot be reached by anyone
 * who guesses a URL.
 *
 * Exits non-zero if anything fails, so a failed run shows as a failed run
 * rather than a green tick over a silent error.
 */
async function main() {
  const started = Date.now();
  const results = await sweepAll();

  for (const r of results) {
    const did =
      r.schedulesMaterialised +
      r.acceptanceReviewsRaised +
      r.mitigationRemindersRaised +
      r.breachesRecorded +
      r.countryReviewsRaised +
      r.webhooksDelivered +
      r.webhooksFailed;

    // A quiet sweep is the normal case, and saying so plainly is what makes the
    // log worth reading when something does happen.
    if (did === 0) {
      console.log(`${r.organisation}: nothing due.`);
      continue;
    }
    console.log(
      `${r.organisation}: ` +
        [
          r.schedulesMaterialised && `${r.schedulesMaterialised} scheduled task(s) raised`,
          r.acceptanceReviewsRaised && `${r.acceptanceReviewsRaised} lapsed acceptance(s) flagged`,
          r.mitigationRemindersRaised && `${r.mitigationRemindersRaised} overdue mitigation(s) chased`,
          r.breachesRecorded && `${r.breachesRecorded} service-level breach(es) recorded`,
          r.countryReviewsRaised && `${r.countryReviewsRaised} country review(s) raised`,
          r.webhooksDelivered && `${r.webhooksDelivered} webhook(s) delivered`,
          r.webhooksFailed && `${r.webhooksFailed} webhook(s) failed`,
        ]
          .filter(Boolean)
          .join(", "),
    );
  }

  console.log(
    `Swept ${results.length} organisation(s) in ${Date.now() - started}ms.`,
  );
  await pg.end();
}

main().catch(async (err) => {
  console.error("Sweep failed:", err);
  await pg.end();
  process.exit(1);
});
