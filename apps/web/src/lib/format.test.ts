import { describe, expect, it } from "vitest";
import { formatDocumentType } from "./format";

describe("formatDocumentType", () => {
  it("labels RESIDENTIAL_RENTAL", () => {
    expect(formatDocumentType("RESIDENTIAL_RENTAL")).toBe("Residential Rental");
  });

  it("labels LAND_LEASE", () => {
    expect(formatDocumentType("LAND_LEASE")).toBe("Land Lease");
  });

  it("does not silently mislabel an unrecognized type as either existing label", () => {
    const result = formatDocumentType("COMMERCIAL_LEASE");
    expect(result).not.toBe("Land Lease");
    expect(result).not.toBe("Residential Rental");
    expect(result).toBe("Unknown document type");
  });

  it("does not mislabel an empty string as either existing label", () => {
    const result = formatDocumentType("");
    expect(result).not.toBe("Land Lease");
    expect(result).not.toBe("Residential Rental");
  });
});
