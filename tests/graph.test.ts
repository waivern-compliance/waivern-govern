import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chainBreaks, type Chain } from "@/services/graph";

const NOW = new Date("2026-08-29T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

type Partial_ = Omit<Chain, "breaks" | "seriousBreaks">;

function risk(over: Record<string, unknown> = {}) {
  return {
    risk: { id: "r", reference: "RISK-1", status: "identified", residualTier: "medium", ...over },
    mitigations: [],
    acceptance: null,
    treated: false,
  } as unknown as Chain["assessments"][number]["risks"][number];
}

function chain(over: Partial<Partial_> = {}): Partial_ {
  return {
    useCase: { id: "u", reference: "AI-1", name: "Recommender" } as Partial_["useCase"],
    live: true,
    assessments: [
      {
        assessment: { id: "a", reference: "DPIA-1", status: "approved" },
        templateName: "AI risk",
        risks: [],
      } as unknown as Partial_["assessments"][number],
    ],
    ...over,
  } as Partial_;
}

describe("where the assurance chain stops", () => {
  it("finds nothing wrong with an approved assessment and no risks", () => {
    const { breaks } = chainBreaks(chain(), NOW);
    assert.deepEqual(breaks, []);
  });

  it("reports a system nothing assesses", () => {
    const { breaks } = chainBreaks(chain({ assessments: [] }), NOW);
    assert.deepEqual(breaks, ["no_assessment"]);
  });

  it("treats an unassessed system as serious only once it is running", () => {
    // A proposal nobody has assessed is a queue; one in production is not.
    const running = chainBreaks(chain({ assessments: [], live: true }), NOW);
    assert.deepEqual(running.seriousBreaks, ["no_assessment"]);

    const proposed = chainBreaks(chain({ assessments: [], live: false }), NOW);
    assert.deepEqual(proposed.breaks, ["no_assessment"]);
    assert.deepEqual(proposed.seriousBreaks, []);
  });

  it("reports an assessment that never finished", () => {
    const draft = chain({
      assessments: [
        {
          assessment: { id: "a", reference: "DPIA-1", status: "in_progress" },
          templateName: "AI risk",
          risks: [],
        } as never,
      ],
    });
    const { breaks, seriousBreaks } = chainBreaks(draft, NOW);
    assert.deepEqual(breaks, ["assessment_unfinished"]);
    assert.deepEqual(seriousBreaks, ["assessment_unfinished"]);
  });

  it("does not also claim nothing assesses it", () => {
    // An unfinished assessment still exists. Reporting both would read as two
    // separate failures when it is one.
    const { breaks } = chainBreaks(
      chain({
        assessments: [
          { assessment: { status: "draft" }, templateName: "t", risks: [] } as never,
        ],
      }),
      NOW,
    );
    assert.ok(!breaks.includes("no_assessment"));
  });

  it("reports an untreated risk, seriously only when severe", () => {
    const medium = chain({
      assessments: [
        { assessment: { status: "approved" }, templateName: "t", risks: [risk()] } as never,
      ],
    });
    const m = chainBreaks(medium, NOW);
    assert.deepEqual(m.breaks, ["risk_untreated"]);
    assert.deepEqual(m.seriousBreaks, []);

    const severe = chain({
      assessments: [
        {
          assessment: { status: "approved" },
          templateName: "t",
          risks: [risk({ residualTier: "critical" })],
        } as never,
      ],
    });
    assert.deepEqual(chainBreaks(severe, NOW).seriousBreaks, ["risk_untreated"]);
  });

  it("ignores a closed risk", () => {
    const closed = chain({
      assessments: [
        {
          assessment: { status: "approved" },
          templateName: "t",
          risks: [risk({ status: "closed" })],
        } as never,
      ],
    });
    assert.deepEqual(chainBreaks(closed, NOW).breaks, []);
  });

  it("treats an expired acceptance as a risk running unaccepted", () => {
    const lapsed = chain({
      assessments: [
        {
          assessment: { status: "approved" },
          templateName: "t",
          risks: [
            {
              ...risk({ status: "accepted" }),
              acceptance: { expiresAt: days(-1) },
              treated: false,
            } as never,
          ],
        } as never,
      ],
    });
    const { breaks, seriousBreaks } = chainBreaks(lapsed, NOW);
    assert.ok(breaks.includes("acceptance_lapsed"));
    // Serious regardless of tier: the status column says accepted and it is not.
    assert.ok(seriousBreaks.includes("acceptance_lapsed"));
  });

  it("leaves a live acceptance alone", () => {
    const live = chain({
      assessments: [
        {
          assessment: { status: "approved" },
          templateName: "t",
          risks: [
            {
              ...risk({ status: "accepted" }),
              acceptance: { expiresAt: days(30) },
              treated: true,
            } as never,
          ],
        } as never,
      ],
    });
    assert.deepEqual(chainBreaks(live, NOW).breaks, []);
  });
});
