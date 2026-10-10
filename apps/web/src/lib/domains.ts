// Display metadata for the seven domains, keyed by the API's DocumentType
// enum value. Mirrors the DomainPack registry (GET /domain-packs) so list
// views can group and tint documents without a network round trip; an
// unknown type falls back to a neutral "Other".
export interface DomainDisplay {
  id: string;
  name: string;
  /** Two-letter monogram for the document tile. */
  mark: string;
  /** Tailwind classes for the monogram tile. */
  tile: string;
}

const DOMAINS: Record<string, DomainDisplay> = {
  residential_rental: {
    id: "residential_rental",
    name: "Residential rental",
    mark: "RR",
    tile: "bg-info-bg text-info-text border-info-border",
  },
  land_lease: {
    id: "land_lease",
    name: "Land lease",
    mark: "LL",
    tile: "bg-safe-bg text-safe-text border-safe-border",
  },
  leave_and_license: {
    id: "leave_and_license",
    name: "Leave and licence",
    mark: "LC",
    tile: "bg-info-bg text-info-text border-info-border",
  },
  sale_property: {
    id: "sale_property",
    name: "Sale of property",
    mark: "SP",
    tile: "bg-saffron-100 text-saffron-700 border-saffron-300",
  },
  builder_buyer: {
    id: "builder_buyer",
    name: "Builder-buyer",
    mark: "BB",
    tile: "bg-saffron-100 text-saffron-700 border-saffron-300",
  },
  employment: {
    id: "employment",
    name: "Employment",
    mark: "EM",
    tile: "bg-review-bg text-review-text border-review-border",
  },
  nda_msa: {
    id: "nda_msa",
    name: "NDA / services",
    mark: "ND",
    tile: "bg-ink-100 text-ink-700 border-ink-200",
  },
};

const DOMAIN_OF_TYPE: Record<string, string> = {
  RESIDENTIAL_RENTAL: "residential_rental",
  LAND_LEASE: "land_lease",
  LEAVE_AND_LICENSE: "leave_and_license",
  AGREEMENT_TO_SELL: "sale_property",
  SALE_DEED: "sale_property",
  BUILDER_BUYER_AGREEMENT: "builder_buyer",
  EMPLOYMENT_CONTRACT: "employment",
  OFFER_LETTER: "employment",
  APPOINTMENT_LETTER: "employment",
  NDA: "nda_msa",
  MUTUAL_NDA: "nda_msa",
  SERVICE_AGREEMENT: "nda_msa",
  MSA: "nda_msa",
};

const OTHER: DomainDisplay = {
  id: "other",
  name: "Other",
  mark: "··",
  tile: "bg-ink-100 text-ink-500 border-ink-200",
};

export function domainForDocumentType(documentType: string): DomainDisplay {
  return DOMAINS[DOMAIN_OF_TYPE[documentType] ?? ""] ?? OTHER;
}
