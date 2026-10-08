"""All v3 domain modules, keyed by domain id (must match ontology.json)."""

from . import (builder_buyer, employment, land_lease, leave_and_license, nda_msa, residential_rental,
               sale_property)

DOMAINS = {m.DOMAIN: m for m in [residential_rental, land_lease, leave_and_license, sale_property, builder_buyer,
                                  employment, nda_msa]}


def required_labels(module, document_type: str) -> list[str]:
    fn = getattr(module, "required_labels", None)
    return fn(document_type) if fn else module.REQUIRED_LABELS


def allowed_document_types(module, inject: str | None) -> list[tuple[str, float]]:
    """Document types an adversarial kind can be injected into."""
    need = module.REQUIRES.get(inject) if inject else None
    if not need:
        return module.DOCUMENT_TYPES
    need = (need,) if isinstance(need, str) else tuple(need)
    return [(dt, w) for dt, w in module.DOCUMENT_TYPES if dt in need]
