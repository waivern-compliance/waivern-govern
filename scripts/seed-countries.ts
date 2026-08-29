import { sql as pg } from "@/db/client";
import { libraryHealth, seedSharedLibrary } from "@/services/countries";

/**
 * Load the shared country library.
 *
 * Separate from `seed` because this is reference data rather than a tenant:
 * one library serves every organisation, and an existing deployment needs it
 * loaded without touching anything else.
 *
 * Running a migration does not do this — the table is schema, the countries are
 * data. Until it is loaded, transfer routing has nothing to answer with and
 * escalates every transfer, which is safe but wrong.
 */
async function main() {
  const result = await seedSharedLibrary();

  if (result.created === 0) {
    console.log(`Country library already loaded — ${result.total} entries, nothing added.`);
  } else {
    console.log(`Country library: ${result.created} of ${result.total} entries added.`);
  }

  console.log(
    "\nEvery seeded entry is marked unverified and due for review, deliberately.",
  );
  console.log(
    "It is a starting point generated from public adequacy decisions, not a",
  );
  console.log(
    "checked source — a privacy professional should confirm each one before an",
  );
  console.log("assessment relies on it. The library page lists them.");

  await pg.end();
  void libraryHealth;
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
