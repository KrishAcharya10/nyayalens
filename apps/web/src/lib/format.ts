export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A lookup table, not a ternary: the previous `type === "RESIDENTIAL_RENTAL"
// ? ... : "Land Lease"` silently mislabeled any unrecognized value as
// "Land Lease" rather than failing loudly. `type` is typed as `string`
// (not the old two-value union) because this function's real input is
// whatever JSON the API actually returns - a TypeScript union was never a
// runtime guarantee against a third value showing up here.
// Mirrors the DomainPack registry's documentTypes[].label (GET
// /domain-packs); kept static so list views can label documents without a
// network round trip. apps/web/src/lib/format.test.ts checks every Phase 8
// type is present.
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL_RENTAL: "Residential Rental",
  LAND_LEASE: "Land Lease",
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

export function formatDocumentType(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? "Unknown document type";
}

export function humanizeLabel(label: string): string {
  return label
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
