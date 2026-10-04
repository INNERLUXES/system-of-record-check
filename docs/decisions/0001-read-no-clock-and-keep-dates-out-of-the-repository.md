# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

An integration map changes over time: a system is retired on a planned day, an exception is approved until a project
ends, a flow is switched off after a cut-over. It is tempting to check these against today: an exception past its end,
a system past its retirement. Doing so would make the same map give a different result on a different day, so a
pipeline that passed yesterday could fail today with no change to the repository. It would also make the tool read
dates in every format a team writes them, and guess the time zone of the person who wrote them.

The checks that matter here do not need a date. Whether shared data has one owner, whether a flow writes into the
record of another system, whether a copy is fed: all of these can be read from the map as it is.

## Decision

1. The tool reads no clock, no time zone and no locale. The same map gives the same output on every machine and on
   every day.
2. A date in a map is text like any other. The map has no key for a date; a date written into a reason or a note is
   not read.
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the examples, not the documents. `npm run check` and a test fail on any number that reads like a year.

## Consequences

- An exception whose end has passed still counts as approved as long as it has a reason. The limits in
  docs/limits.md say so, and a team that wants an end to an exception removes it from the map.
- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- The README, the documents and the examples can be read in any year without being out of date about a date.
