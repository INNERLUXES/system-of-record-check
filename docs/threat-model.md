# Threat model

## What the tool touches

- It reads the map file named on the command line and the configuration file named with `--config`. Nothing else is
  opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, follows no symbolic link, evaluates nothing it reads and starts no program.

## What the input may hold

An integration map lives in a repository that many people change: the teams of the ERP, the CRM, the shop and the
integration platform. In a pipeline that checks every pull request, the map is written by whoever opened the pull
request, and so is the configuration.

Through the inputs, a person can try to:

- make the tool read another file: the map or the configuration named through a symbolic link that points at a key
  file, a file swapped for a link between the check and the read;
- make the tool fetch something: a path written as a web address;
- make a weak map pass: an owner claimed by two systems hidden in a long map, a team of TBD, an exception with a reason
  of TBD, a flow that names a system the map does not describe, a key misspelt so that it is never read (`own` for
  `owns`), a field named twice;
- move the result through the configuration: a key named twice, an unknown key that looks like a known one, a rule set
  to off, a value added to the empty values, `systemOwner` emptied;
- exhaust the memory or the time: thousands of systems, flows and fields, a file of gigabytes, a line of megabytes,
  long runs of colons, quotes, hashes, brackets and spaces in YAML, JSON nested a million deep;
- slip in something that is not text: a binary file named `.json`, a file in UTF-16, bytes that are not UTF-8;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators
  in the file name, the name of the map, a team, a contact or a reason;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the
  GitHub format writes into a command;
- change how objects behave: a system, an entity, a field or a key named `__proto__`, `constructor` or `toString`;
- make the output change from day to day: a date in the map.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read another file | The named path is looked at without following a link, and a link is refused; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle, so a file swapped for a link is refused. A test names the map and the configuration through a link |
| The tool fetches a web address | No module of the network is imported; a path that looks like an address is refused. A test checks the imports of src |
| A weak map passes | A key the tool does not know is an error with its line and a suggestion; a value of the wrong kind, a name that is not a name, a field named twice and an owned field that is not held are errors; a team, a contact or a reason that is empty, a dash or one of the empty values counts as missing; a flow that names something the map does not describe is a finding |
| A key named twice or an unknown key moves the result | The JSON and YAML readers refuse a repeated key; an unknown key in the map or the configuration stops the run with its line; removing an entry that is not on a list and adding one that is are refused |
| The memory or the time is exhausted | The files have size limits checked on the open handle before they are read; the readers count values, depth and the length of every string, and the YAML reader counts lines; every line is read once, left to right; ownership and flows are looked up in maps, not searched; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the map or the configuration; a test looks for `new RegExp` in src |
| A binary or UTF-16 file is read as text | A null byte, a UTF-16 byte order mark or bytes that are not valid UTF-8 stop the run with exit code `2` |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts ANSI escapes and direction controls in a file name, the name of the map, a team, a contact and a reason, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%` into a contact and a comma and a colon into the file name |
| `__proto__` changes how objects behave | The readers define own properties; a name must start with a letter, so `__proto__` is never a system, an entity or a field; lookups use `Map`. A test uses `constructor`, `toString` and `hasOwnProperty` as names |
| A device or a pipe hangs the tool | A map or a configuration that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |
| The output changes with the clock | The tool reads no clock, no time zone and no locale ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)) |

## Out of scope

Whether the map is true to the systems, whether a reason for an exception is a good one, who may change the map or
the configuration in your repository, and where your pipeline keeps the output.
