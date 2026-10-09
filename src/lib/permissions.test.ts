import { describe, expect, it } from "vitest";
import { can, canEditCampaign } from "./permissions";

describe("permissions", () => {
  it("viewer is read-only", () => {
    expect(can("viewer", "campaign:create")).toBe(false);
    expect(can("viewer", "campaign:pause")).toBe(false);
    expect(canEditCampaign("viewer", "draft")).toBe(false);
  });

  it("editor creates and edits drafts, pauses and resumes, but can't archive", () => {
    expect(can("editor", "campaign:create")).toBe(true);
    expect(can("editor", "campaign:pause")).toBe(true);
    expect(can("editor", "campaign:resume")).toBe(true);
    expect(can("editor", "campaign:archive")).toBe(false);
    expect(canEditCampaign("editor", "draft")).toBe(true);
    expect(canEditCampaign("editor", "running")).toBe(false);
  });

  it("admin can do everything", () => {
    expect(can("admin", "campaign:archive")).toBe(true);
    expect(can("admin", "campaign:change-owner")).toBe(true);
    expect(canEditCampaign("admin", "running")).toBe(true);
  });
});
