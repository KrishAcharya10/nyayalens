// The one place the two live DomainPacks are registered - Phase 8 Step 2
// (docs/phase8/step2_migration_notes.md). Per Step 1's design doc §3,
// loading is static and explicit: no filesystem scanning, no dynamic
// import() of a user-supplied path, no network fetch. Adding a future
// domain means one more registry.register(...) call here, reviewed like
// any other code change.
//
// getDomainPackRegistry() is a lazily-initialized singleton, not a
// module-top-level side effect, deliberately: risk/pass1PerClause.ts and
// risk/pass2CrossClause.ts both call this function (from a default
// parameter, evaluated at call time) to resolve a document's pack, while
// rentalPack.ts/landLeasePack.ts import check implementations from
// risk/missingClauseCheck.ts and risk/sharedChecks.ts (not from
// pass1PerClause.ts/pass2CrossClause.ts) - so there is no cycle. Making
// registration lazy is an extra safety margin on top of that, not a
// substitute for it: eager top-level registration would still be
// cycle-free given that layering, but lazy initialization means the
// registry is only ever built once every module in this file's import
// graph has already finished loading, which is the safest place for it
// regardless of how the pack files evolve later.
import { createRegistry, type DomainPackRegistry } from "./registry.js";
import { builderBuyerPack } from "./builderBuyerPack.js";
import { employmentPack } from "./employmentPack.js";
import { landLeasePack } from "./landLeasePack.js";
import { leaveAndLicensePack } from "./leaveAndLicensePack.js";
import { ndaMsaPack } from "./ndaMsaPack.js";
import { salePropertyPack } from "./salePropertyPack.js";
import { residentialRentalPack } from "./rentalPack.js";
import type { RiskEngineContext, RiskFinding } from "../risk/types.js";

let registry: DomainPackRegistry<RiskEngineContext, RiskFinding> | undefined;

export function getDomainPackRegistry(): DomainPackRegistry<RiskEngineContext, RiskFinding> {
  if (!registry) {
    registry = createRegistry<RiskEngineContext, RiskFinding>();
    registry.register(residentialRentalPack);
    registry.register(landLeasePack);
    registry.register(leaveAndLicensePack);
    registry.register(salePropertyPack);
    registry.register(builderBuyerPack);
    registry.register(employmentPack);
    registry.register(ndaMsaPack);
  }
  return registry;
}
