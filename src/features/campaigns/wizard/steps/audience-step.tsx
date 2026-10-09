"use client";

import { AudienceEstimate } from "../rule-builder/audience-estimate";
import { RuleGroup } from "../rule-builder/rule-group";

/** Step 2: the rule tree on the left, the live estimate on the right. */
export function AudienceStep({ currencies }: { currencies: string[] }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_16rem]">
      <RuleGroup path="audience" depth={0} currencies={currencies} />
      <AudienceEstimate />
    </div>
  );
}
