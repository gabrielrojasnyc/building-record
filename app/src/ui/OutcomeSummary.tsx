import { formatCount } from "@/domain/format";
import { OUTCOME_LABEL, OUTCOMES, type Outcome } from "@/domain/outcomes";
import { COUNT_ROW } from "./panelParts";

/**
 * How the city closed a set of complaints: one row per outcome that has any, in the city's order,
 * then how many duplicate reports were left out. Every outcome is drawn alike; none is a verdict.
 */
export function OutcomeSummary(props: {
  split: Record<Outcome, number>;
  /** Confirmed violations whose case is not closed, or null while that is not known. */
  violationsOpen: number | null;
  duplicates: number;
}) {
  const found = OUTCOMES.filter((outcome) => props.split[outcome] > 0);
  const stillOpen = props.violationsOpen ?? 0;

  if (found.length === 0 && props.duplicates === 0) return null;

  return (
    <>
      {found.length > 0 && (
        <ul className="text-[14px]">
          {found.map((outcome) => (
            <li key={outcome} className={COUNT_ROW}>
              <span>
                {OUTCOME_LABEL[outcome]}
                {outcome === "violation" && stillOpen > 0 && (
                  <span className="ml-2 text-[12px] whitespace-nowrap text-steel tabular-nums">
                    {formatCount(stillOpen)} still open
                  </span>
                )}
              </span>
              <span className="text-right tabular-nums">
                {formatCount(props.split[outcome])}
              </span>
            </li>
          ))}
        </ul>
      )}
      {props.duplicates > 0 && (
        <p
          className={`text-[12.5px] text-steel ${found.length > 0 ? "mt-2" : ""}`}
        >
          {formatCount(props.duplicates)}{" "}
          {props.duplicates === 1
            ? "duplicate report not counted"
            : "duplicate reports not counted"}
        </p>
      )}
    </>
  );
}
