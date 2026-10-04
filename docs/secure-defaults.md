# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest
of the document is about what the tool cannot do for you: where the map comes from, where the output goes, and who may
change the configuration.

## How the tool behaves by default

- **Reads, never follows.** The tool reads the map it is given and the configuration named with `--config`. It follows
  no symbolic link, fetches no web address, refuses an argument that looks like an address, starts no program and
  writes nothing to disk.
- **Every rule on from the first run.** Without a configuration, the four rules about owners, write-backs and unknown
  names are errors, and the three about copies, loops and owners of systems are warnings.
- **Unknown keys are errors.** A key in the map or the configuration that the tool does not know stops the run, with
  its line and a suggestion, so a typo such as `own` for `owns` cannot leave a claim unread. A key named twice stops
  the run. So does a field named twice, an owned field the system does not hold, and a mode the configuration does not
  list.
- **Fail closed on what it cannot read.** An input that cannot be read stops the run with exit code `2` and no result:
  a missing file, a folder, a link, a file over its limit, a binary file, UTF-16, bytes that are not UTF-8, YAML
  outside the subset.
- **Empty is not found.** A team, a contact or a reason that says nothing (TBD, a dash, an empty text) counts as
  missing, so an exception with a reason of TBD is not approved.
- **No regular expression from the input.** No pattern is built from the map or the configuration, and the readers go
  through each line once.
- **No prototype tricks.** Objects are built with own properties, lookups use `Map`, and a name must start with a
  letter, so `__proto__` is never a system, an entity or a field.
- **Clean output.** Text from the input, file names included, has control characters, line separators and direction
  controls removed and its length capped before it reaches a report or an error message. The GitHub format escapes
  `%`, CR and LF in a message and also `:` and `,` in a property, so a text cannot end a workflow command early or
  start another one.
- **The same map gives the same output.** The tool reads no clock, no time zone, no locale and no random number
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)), and case is changed for the
  letters A to Z only.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`"rules": { "unfedCopy": "error", "circularSync": "error" }`.** A copy with no feed from its owner, or a field
  synced both ways, fails the run.
- **`"rules": { "systemWithoutOwner": "error" }`.** Every system must name a team and a contact.
- **`"modes": ["api", "event"]`.** Only the modes your integration standards allow; a flow by file or by hand stops
  the run until it is added.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: System of record check
    run: npx --yes github:INNERLUXES/system-of-record-check docs/integration-map.yaml --format github
```

- Give the job read access to the contents and nothing more. The tool needs no secret.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because
  `npx` runs what it downloads.
- Do not hide the exit code with a trailing `|| true`.
- An integration map names systems, teams and the data they hold. Post the output only where the people who may read
  the map read it.

## Protecting the map and the configuration

The map decides who owns what, and an exception with a reason lets a flow write into the record of another system.
Keep the map and the configuration in the repository, put their paths in `CODEOWNERS` with the people who own the
integration architecture, and require their review in branch protection. Review a change that adds an exception, moves
an `owns`, sets a rule to off or lower, adds an empty value, or empties `systemOwner` like a change to code: each of
them can let a weak map pass.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
