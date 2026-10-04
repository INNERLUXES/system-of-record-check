# Changes

## 1.0.0

First release.

- Checks an integration map in JSON or in a plain subset of YAML that lists the systems of an enterprise, the entities and fields each holds, which system owns each of them as its system of record, and the flows of data between the systems, and reports what keeps the map from naming one owner for every piece of shared data.
- Seven rules: `missing-owner`, `conflicting-owner`, `write-back`, `unfed-copy`, `unknown-reference`, `circular-sync` and `system-without-owner`, each with a level of its own (`error`, `warning`, `notice` or `off`) and the points of the public pages it rests on.
- Ownership by entity (`owns: true`) and by field (`owns: [field, ...]`), with a claim on a field before a claim on its entity, so the ERP can own the credit limit of a customer the CRM owns. A flow that writes into the record of another system passes only as an approved exception with a reason.
- A strict map: a key the tool does not know, a value of the wrong kind, a name that is not a name, a field named twice and a mode the configuration does not list stop the run with every problem and its line. A YAML reader for a plain subset that refuses anchors, tags, block scalars and the rest with their line.
- A configuration file in strict JSON over documented defaults: the modes, the values that say nothing, what a system must name, the level of every rule and the minimum severity; a key the tool does not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON and GitHub workflow commands (`--format github`) that show each finding as an annotation on the map file and line, an ownership matrix (`--matrix`) of every entity and field by system, `--min-severity` to hide the findings below a level, and `--explain` to show the rule and the sources behind each finding. Exit code `0` when no finding is at the level error, `1` when one is, `2` for a usage or input error, with no result.
- Reads no clock, follows no symbolic link, fetches nothing, writes nothing to disk, and refuses binary, UTF-16 and invalid UTF-8 input; every input has a size limit.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the repository.
