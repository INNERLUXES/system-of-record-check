# Limits

The tool checks what an integration map says: which system owns each entity and field, which systems hold copies, and
which flows move data between them. It does not connect to any system, and a map with no finding can still describe
an estate that does not exist, or miss half of it. Every report ends with a sentence that says so.

## What it cannot see

- **The systems themselves.** The tool reads the map, not the ERP, the CRM or the integration platform. A field the
  map leaves out, or a flow nobody wrote down, is not there for the tool.
- **Meaning.** Two names for one field (`custNo` and `accountNumber`) are two fields, and one name used for two things
  is one field. The tool compares names exactly, with their case.
- **What a flow does with a field.** A flow that carries a field into a system that does not own it is counted as a
  write of that field, even when the target only keeps it in a separate place.
- **Copies kept by hand.** A copy kept up to date by a person, a report or a process the map does not list has no feed
  in the map and is reported by `unfed-copy`.
- **Loops through a third system.** `circular-sync` sees a field that goes from A to B and back; a loop from A to B to
  C and back to A is not reported. A flow that passes on a copy is reported by `write-back`, which catches the middle
  step of most such loops.
- **Who a team or a contact is.** `team: someone` counts; only the values that say nothing, such as TBD, do not.
- **Whether a reason is good.** An exception counts as approved when its reason is not empty and is not one of the
  values that say nothing.
- **YAML beyond the subset.** Anchors, aliases, tags, block scalars, mappings in braces, values over several lines and
  several documents are refused with their line rather than read (docs/method.md).

## Size limits

Past a limit, the input is refused with exit code `2` and no result, or, where the limit is on the work and not the
input, the report says so in a note.

| What | Limit |
| --- | --- |
| map file | 2 MB |
| configuration file | 1 MB; 500 entries in a list; 120 characters for an entry |
| systems | 500 |
| entities of one system | 1,000 |
| fields of one entity, or of one flow | 5,000 |
| flows | 5,000 |
| names | 80 characters |
| texts (name, team, contact, reason, note) | 300 characters |
| JSON | nesting 32 deep, 100,000 values, 4,096 characters in a string |
| YAML | 200,000 lines, nesting 32 deep, 100,000 values, 4,096 characters in a value |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests read maps with three hundred systems and hundreds of flows of forty fields, twelve hundred flows that all
write back, YAML lines of megabytes full of colons, quotes, hashes, brackets and spaces, and JSON nested half a million
deep, each with a time check.
