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

describe("formatDocumentType (Phase 8 domains)", () => {
  it("labels every Phase 8 document type", () => {
    const expected: Record<string, string> = {
      LEAVE_AND_LICENSE: "Leave and License",
      AGREEMENT_TO_SELL: "Agreement to Sell",
      SALE_DEED: "Sale Deed",
      BUILDER_BUYER_AGREEMENT: "Builder-Buyer Agreement",
      EMPLOYMENT_CONTRACT: "Employment Contract",
      OFFER_LETTER: "Offer Letter",
      APPOINTMENT_LETTER: "Appointment Letter",
      NDA: "Non-Disclosure Agreement",
      MUTUAL_NDA: "Mutual NDA",
      SERVICE_AGREEMENT: "Service Agreement",
      MSA: "Master Service Agreement",
    };
    for (const [type, label] of Object.entries(expected)) {
      expect(formatDocumentType(type)).toBe(label);
    }
  });
});
