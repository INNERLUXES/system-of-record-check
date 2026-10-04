# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which checks lean on it. Nothing here is a copy of a page: read the page itself for its exact wording.
src/data.js holds the same pages and the points the reports show, and test/data.test.js checks that every page there
is listed here. Each page was read before it was listed.

## System of record (Wikipedia)

https://en.wikipedia.org/wiki/System_of_record

An overview of the idea. A system of record is the data source that counts as the authority for a given element of
data. The page explains why the idea exists: in a large organisation several systems often hold the same data and
disagree about it, through differences in meaning, in timing or plain bugs, and naming one authority settles which
copy is right. It also says that data is trusted when it can be traced back to a good source, and that the idea works
best when everyone who uses the data accepts the same authority. Its points that matter here:

- One authority for each piece of data: a field or an entity held by several systems needs one owner
  (`missing-owner`), and two owners are no authority at all (`conflicting-owner`).
- A link to a good source: a flow that names a system, an entity or a field the map does not describe cannot be traced
  to anything (`unknown-reference`).

## Master data management (Wikipedia)

https://en.wikipedia.org/wiki/Master_data_management

An overview of the discipline that keeps the shared, core data of an organisation (customers, products, employees)
consistent across its systems. The page describes the problem the discipline answers, many copies of the same data in
separate systems and business units, and names roles such as data owners and data stewards, so that someone is
accountable for each set of data. This tool leans on it for `missing-owner` and `unfed-copy` (copies in many systems
must be kept consistent) and for `system-without-owner` (someone must be accountable for the data a system holds).

## Single source of truth (Wikipedia)

https://en.wikipedia.org/wiki/Single_source_of_truth

An overview of the practice of mastering, or editing, each data element in one place only, with the other places
reading it or pointing at it instead of changing copies of their own. The page names master data management, event
sourcing and data warehouses as ways to come close when one place for everything is not possible. A flow that writes a
field into its owner from somewhere else edits the element in a second place (`write-back`), two owners make two
places (`conflicting-owner`), and a field synced both ways is edited on both sides (`circular-sync`).

## Data redundancy (Wikipedia)

https://en.wikipedia.org/wiki/Data_redundancy

An overview of data kept in more than one place. Its example is customer data repeated with every product a customer
buys, so that the same customer can end up with different values for the same attribute. A copy of a field that no
flow from its owner keeps up to date is that risk in an integration map (`unfed-copy`).

## Data synchronization (Wikipedia)

https://en.wikipedia.org/wiki/Data_synchronization

An overview of keeping a source and a target consistent over time, one way or between several copies that can each
change. When more than one copy is changed, the changes have to be reconciled, which is why a field that flows both
ways between two systems is reported (`circular-sync`). Which side wins in a conflict is a choice the map does not
record; the tool only points at the loop.

## Data steward (Wikipedia)

https://en.wikipedia.org/wiki/Data_steward

An overview of the role that looks after a set of data: keeping its definitions, rules and sources of authority
documented, keeping it fit for use, and being the contact for questions about it. A system in the map with no team or
no contact has no one in that role for the data it holds (`system-without-owner`).

## YAML Ain't Markup Language, version 1.2.2

https://yaml.org/spec/1.2.2/

The YAML specification. The reader of this tool follows a small part of it: block structure set by indentation with
spaces (the specification forbids tabs for indentation), entries of a block list started by a dash and a space,
comments started by a #, and keys of a mapping that must be unique. Everything outside that part (anchors, aliases,
tags, block scalars, mappings in braces, values over several lines, several documents) is refused with its line
rather than read in a way the specification does not mean. docs/method.md lists the subset.

## Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::error`, `::warning` and `::notice` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such
command per finding, with the map file and the line of the finding.

## RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects notes that when the names in an object are not unique, programs that read
it behave in different ways: some keep the last value, some fail, some keep every pair. The map reader and the
configuration reader refuse a repeated name instead of keeping one of the values, so a finding never depends on which
value a library would keep.
