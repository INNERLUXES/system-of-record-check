# Method

This document says exactly what the tool reads, how it works out who owns what, and what each rule looks at and
cannot see. The words named here are the defaults; docs/inputs.md says how the configuration changes them.

## What is read

The input is one map file. Its name says how it is written: `.json` for JSON, `.yaml` or `.yml` for the YAML subset
below; any other name stops the run with exit code `2`. The file is read as UTF-8, with or without a byte order mark,
with LF, CR LF or CR line ends. A file that is binary, UTF-16 or not valid UTF-8, a folder, a symbolic link, a device
or a file over 2 MB stops the run with exit code `2`, so a run never passes because something could not be read.

## The JSON that is read

The JSON reader follows RFC 8259 strictly: no comments, no trailing comma, no single quotes, no NaN. An object that
names a key twice is refused, because programs disagree on which value such an object holds.

## The YAML that is read

The YAML reader reads a subset, enough to write a map by hand, and refuses the rest with its line:

- **Mappings.** A line `key: value`, or `key:` with the value on the lines indented under it. A key may be written in
  quotes. A key named twice in one mapping is refused.
- **Lists.** Lines that start with `- ` at the same indentation. An entry may start a mapping on its own line
  (`- id: crm-to-erp`) and continue on the lines under it, or hold a list of its own. A list may sit at the
  indentation of its key. A short list may be written in brackets on one line: `[id, name, "legal name"]`.
- **Values.** Text in double quotes (with the escapes `\"`, `\\`, `\/`, `\n`, `\t`, `\r`, `\b`, `\f`, `\0` and
  `\uXXXX`), text in single quotes (`''` for a quote), or plain text. Plain `true`, `false`, `null`, `~` and numbers
  are read as such, `{}` is an empty mapping and `[]` an empty list.
- **Comments.** A `#` at the start of a line or after a space or a tab starts a comment, outside quotes.
- **Indentation.** Spaces only; a tab in the indentation is refused, as YAML refuses it.

Refused with their line: anchors (`&`), aliases (`*`), tags (`!`), block scalars (`|` and `>`), mappings in braces,
keys with `?`, a plain value that holds `: `, a value that runs on over several lines, lists in brackets inside
another, directives (`%YAML`) and a second document. A first `---` is allowed.

## The form of the map

The map is an object with `name` (optional), `systems` and `flows` (optional). docs/inputs.md describes every key.

- **Systems** are an object keyed by system id. A system has `name`, `kind`, `team` and `contact` (all optional texts)
  and `entities`, an object keyed by entity name.
- **An entity** of a system is a list of the fields the system holds, or an object with `fields` (that list) and
  `owns`: `true` when the system is the system of record of the entity, or a list of the fields it owns. A field in
  `owns` must be one of its fields.
- **Flows** are a list. A flow has `source` and `target` (system ids), `entity`, `fields` (a list), `mode` (one of
  the modes of the configuration: api, batch, event, file, manual, cdc and etl by default), and optionally `id`,
  `direction` (`one-way`, the default, or `two-way`), `exception` (`true`, or an object with `reason` and
  `approvedBy`) and `note`.
- **Names** of systems, entities, fields and flows are a letter followed by letters, digits, `-` and `_`, at most 80
  characters, so `entity.field` always reads one way.

A key the tool does not know, a value of the wrong kind, a name that is not a name, a field named twice, an owned field
that is not held, a flow from a system to itself, a flow id used twice, a mode the configuration does not list, and a
direction that is neither `one-way` nor `two-way` stop the run with exit code `2` and every problem with its line. A
flow that names a system, an entity or a field that the map does not describe is read: that is a finding.

## Who owns what

For every entity, the holders are the systems that list it, and the claims on it are the systems that say
`owns: true`. The entity has one owner when exactly one system claims it.

For every field of an entity, the holders are the systems that list the field. The owners of the field are:

1. the systems that name the field in `owns`, when there is at least one; a claim on a field comes before a claim on
   its entity, so the ERP can own `customer.creditLimit` inside a customer the CRM owns;
2. otherwise, the systems that claim the entity and hold the field. A system that owns an entity owns only the fields
   of it that it holds.

A field has one owner when that list has exactly one system. Every other holder of the field holds a copy.

## Flows

A flow runs from its source to its target; a two-way flow also runs from its target to its source, and each way is
checked on its own. The fields a flow carries are the fields of its list that both ends hold; a field that one end
does not hold is a finding of `unknown-reference` and is not carried. A flow is an approved exception when it has
`exception` with a `reason` that is not empty, not only marks, and not one of the values that say nothing (`tbd`,
`tba`, `todo`, `none`, `n/a`, `na`, `unknown`, `unassigned`, `nobody`, `no one`, `not assigned`), compared as whole
lowercase words.

## Rules

### `missing-owner`

An entity held by two or more systems that no system claims with `owns: true` is reported once, on the line of the
entity in the first system that holds it; its fields are not reported one by one. When the entity has one owner, a
field held by two or more systems is reported when no system names it in `owns` and the owner of the entity does not
hold it. An entity with two owners is left to `conflicting-owner`.

Cannot see: whether the systems really hold the same thing under the same name; two names for one field
(`custNo` and `accountNumber`) are two fields.

### `conflicting-owner`

An entity that two or more systems claim with `owns: true`, reported on the `owns` line of the second; and a field
that two or more systems name in `owns`, reported on that name in the second. A field owned by one system inside an
entity owned by another is not a conflict.

### `write-back`

For each flow and each way it runs, the carried fields whose one owner is not the system the way comes from. When the
owner is the target, the flow writes into the record of the owner; when the owner is a third system, the flow passes
on a copy, and its target is fed from a copy and not from the owner. One finding for each flow, way and owner, on the
line of the flow. An approved exception is not reported; an exception with no reason is reported, with a note that it
gives none. A field with no owner or two owners is left to the rules above.

Cannot see: what a flow does with a field at its target. A flow that only reads a field into a separate place at the
target is still counted as a write of that field.

### `unfed-copy`

For each field with one owner, each holder other than the owner needs a flow from the owner, one-way or two-way, that
carries the field to it. A copy with no such flow is reported, grouped by holder and owner within an entity, on the
line of its first field in the holder. A copy fed through another copy is reported, and so is a copy fed only by an
approved exception from another system.

Cannot see: a copy kept up to date by hand or by a process the map does not list.

### `unknown-reference`

A flow whose source or target is not a system of the map; a flow whose entity no system holds; a flow whose source or
target does not hold its entity; and a flow with fields that its source or its target does not hold, one finding for
each end. All on the line of the flow.

### `circular-sync`

A field that is carried from one system to another and back, through a two-way flow or two one-way flows, reported
once for each pair of systems and entity with every such field, on the line of the last flow involved. A loop in which
one of the flows is an approved exception is not reported.

Cannot see: a loop through a third system (A to B, B to C, C to A).

### `system-without-owner`

A system whose `team` or `contact`, as `systemOwner` of the configuration asks, is missing, empty, only marks, or one
of the values that say nothing, on the line of the system. One finding for each system, naming what is missing.

Cannot see: whether the team or the contact exists.

## The ownership matrix

`--matrix` prints a row for every entity and every field of it, in the order the map first names them, and a column
for every system, in the order of the map: `O` for an owner, `C` for a holder that does not own it, `.` for a system
that does not hold it. A row ends with `no owner` when two or more systems hold it and none owns it, and with
`2 owners` (or more) when two or more claim it. The matrix ends with the counts of the findings and the result, and
the run exits with the same code as without `--matrix`.

## The output

Findings are sorted by level (errors first), then by line, then by the order of the rules. A rule lists at most 500
findings; the rest are counted in a note and still count for the result. Every text from the map goes through the
same cleaning: control characters, line separators and direction controls become spaces, and long texts are cut.
