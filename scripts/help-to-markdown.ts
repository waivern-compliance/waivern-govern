import { writeFileSync } from "node:fs";
import { HELP_GROUPS, HELP_TOPICS, TOPIC_BY_ID } from "@/lib/help/topics";

/**
 * The in-product help, as one readable document.
 *
 * Generated rather than written, so it cannot drift from what the application
 * actually shows. Re-run it after editing topics.ts; do not edit the output.
 */

const OUT = "docs/help.md";

function main() {
  const lines: string[] = [
    "# Waivern Govern — help",
    "",
    "Every help topic the application carries, in the order it presents them.",
    "",
    "> Generated from `src/lib/help/topics.ts` by `pnpm help:md`.",
    "> Edit the topics file, not this one.",
    "",
    "## Contents",
    "",
  ];

  // A table of contents, because 24 topics is more than anybody scrolls.
  for (const group of HELP_GROUPS) {
    lines.push(`**${group.heading}**`, "");
    for (const id of group.ids) {
      const topic = TOPIC_BY_ID.get(id);
      if (!topic) continue;
      const anchor = topic.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      lines.push(`- [${topic.title}](#${anchor}) — ${topic.summary}`);
    }
    lines.push("");
  }

  for (const group of HELP_GROUPS) {
    lines.push("---", "", `# ${group.heading}`, "");

    for (const id of group.ids) {
      const topic = TOPIC_BY_ID.get(id);
      if (!topic) continue;

      lines.push(`## ${topic.title}`, "", `*${topic.summary}*`, "");

      if (topic.path) lines.push(`**Screen:** \`${topic.path}\``, "");

      for (const section of topic.sections) {
        lines.push(`### ${section.heading}`, "");
        for (const paragraph of section.body) lines.push(paragraph, "");
        if (section.points) {
          for (const point of section.points) lines.push(`- ${point}`);
          lines.push("");
        }
      }

      if (topic.related?.length) {
        const names = topic.related
          .map((r) => TOPIC_BY_ID.get(r)?.title)
          .filter(Boolean);
        if (names.length) lines.push(`**See also:** ${names.join(" · ")}`, "");
      }

      // Kept out of the prose but recorded, since they are what makes a
      // search for "article 30" or "sla" land on the right topic.
      if (topic.keywords?.length) {
        lines.push(`<sub>Also searchable as: ${topic.keywords.join(", ")}</sub>`, "");
      }
    }
  }

  const filed = new Set(HELP_GROUPS.flatMap((g) => g.ids));
  const unfiled = HELP_TOPICS.filter((t) => !filed.has(t.id));
  if (unfiled.length > 0) {
    // Should be unreachable — a test asserts it — but saying so beats
    // silently omitting a topic from the document.
    lines.push("---", "", "# Not filed under any heading", "");
    for (const topic of unfiled) lines.push(`- **${topic.title}** — ${topic.summary}`);
    lines.push("");
  }

  writeFileSync(OUT, lines.join("\n"));
  console.log(
    `Wrote ${OUT}: ${HELP_TOPICS.length} topics in ${HELP_GROUPS.length} groups` +
      (unfiled.length ? `, ${unfiled.length} unfiled` : ""),
  );
}

main();
