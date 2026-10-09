// One permission table shared by both sides:
// - the server enforces it (403 from Server Actions / Route Handlers);
// - the client only uses it to hide or disable controls.

export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | "campaign:create"
  | "campaign:edit-draft"
  | "campaign:edit-any"
  | "campaign:pause"
  | "campaign:resume"
  | "campaign:archive"
  | "campaign:change-owner";

const ALLOWED_ROLES: Record<Action, readonly Role[]> = {
  "campaign:create": ["editor", "admin"],
  "campaign:edit-draft": ["editor", "admin"],
  "campaign:edit-any": ["admin"],
  "campaign:pause": ["editor", "admin"],
  "campaign:resume": ["editor", "admin"],
  "campaign:archive": ["admin"],
  "campaign:change-owner": ["admin"],
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED_ROLES[action].includes(role);
}

/** Editors may edit drafts only; admins may edit any campaign. */
export function canEditCampaign(role: Role, status: string): boolean {
  return status === "draft" ? can(role, "campaign:edit-draft") : can(role, "campaign:edit-any");
}
