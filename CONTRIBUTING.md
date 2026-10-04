# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!` for a breaking change.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules conservative. A finding must point at something a reader can check in the map: a system, an entity, a field, an `owns` line or a flow. Never add a rule that guesses what a name means.
3. A run must never pass because something could not be read: an input that cannot be read, or a map whose form is wrong, stops the run with exit code `2`.
4. Never read the clock or a date ([decision 1](docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
5. Add a test with the map written inline (`base()` and `reportOf()` in test/helpers.js build one that passes every check), small enough that the result can be worked out by hand, with a near miss on each side.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output and the GitHub annotations.

## Changing how owners are worked out

1. A claim on a field comes before a claim on its entity, and an owner of an entity owns only the fields it holds ([decision 2](docs/decisions/0002-a-claim-on-a-field-comes-before-a-claim-on-its-entity.md)). A change to this changes the result of every map; describe it in a decision first.
2. Keep src/ownership.js the one place where owners are worked out; the rules and the matrix read its result.

## Changing the map or the configuration file

1. A new key of the map is added to `MAP_KEYS` in src/map.js, and a new key of the configuration to `KEYS` in src/config.js. Both are documented in docs/inputs.md and tested with a good value and a bad one. Every key the tool does not know stays an error, and a key named twice stays refused.
2. A list of the configuration keeps the array form and `replace`, `add` and `remove`; removing an entry that is not there stays an error.
3. Never add a key that takes a regular expression.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule with its points. A test checks all three against each other.

## Changing a reader

1. The tool reads; it never follows. A symbolic link is never read, and nothing but the map and the configuration is opened.
2. Keep the work bounded: the limits of docs/limits.md, and a hostile test with a large input and a time check.
3. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
4. A map written with LF and with CRLF line ends, with or without a byte order mark, must give the same output. The example maps are stored as written (`.gitattributes`), and a test reads them both ways.
5. Where the YAML reader reads less than YAML, it refuses with a line; it never reads a form in a way the specification does not mean. Say so in docs/method.md.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions, a character that a file name cannot hold on every system) is guarded with `process.platform`, says why in its `t.skip`, and asserts no line of its own: a line is asserted only in a test that runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written by hand. `test/repo.test.js` fails when a guarded test asserts a line. Every other test builds its paths with `resolve()` from names with forward slashes.

A test never reads the clock, the time zone or the locale.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the map and the configuration it is given and writes only to standard output and standard error. It opens no network connection and runs no program.
- Text from the input, file names included, goes through `safeText` before it reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0) and the numbers of a standard (RFC 8259, YAML 1.2.2) are fine.
- Examples and tests use made-up companies, systems and teams, never the real map of a real company.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
