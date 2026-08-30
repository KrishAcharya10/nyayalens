# Adversarial test cases (placeholder)

Empty in Phase 1-2. This folder will hold synthetically-constructed test
documents designed to test the risk engine and missing-clause detector
against problems that are lexically unremarkable but substantively
concerning (as opposed to the main synthetic dataset in
`research/data/synthetic/`, which tests parsing/NER correctness).

See `docs/research/adversarial_test_design.md` for the full design: the
five case categories, how each will be constructed with a gradable
`expected_flag` label, and which pipeline component (risk engine,
missing-clause detector, or a not-yet-built cross-clause consistency
checker) is responsible for catching each one.

No generator or detection code for these cases exists yet — this is a
placeholder until the risk engine phase is built.
