"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ROLES, type Role } from "@/lib/permissions";
import { setRoleAction } from "./actions";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Read-only access.",
  editor: "Create and edit drafts, pause and resume campaigns.",
  admin: "Everything, including archiving and changing the owner.",
};

export function RoleSwitcher({ role }: { role: Role }) {
  // Shows the new role immediately while the action runs. When the transition ends, the value
  // falls back to the `role` prop: the new one on success (the page re-renders with the new
  // cookie), the old one on failure — so there is no manual rollback.
  const [optimisticRole, setOptimisticRole] = useOptimistic(role);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const next = value as Role;
    startTransition(async () => {
      setOptimisticRole(next);
      const result = await setRoleAction(next);
      if (!result.ok) toast.error(`Couldn't switch the role: ${result.error.message}`);
    });
  }

  return (
    <RadioGroup value={optimisticRole} onValueChange={handleChange} disabled={isPending} aria-label="Role">
      {ROLES.map((value) => (
        <Label
          key={value}
          htmlFor={`role-${value}`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
        >
          <RadioGroupItem id={`role-${value}`} value={value} className="mt-0.5" />
          <span className="grid gap-1">
            <span className="font-medium capitalize">{value}</span>
            <span className="text-sm font-normal text-muted-foreground">{ROLE_DESCRIPTIONS[value]}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
