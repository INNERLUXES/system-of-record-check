# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "system-of-record-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up map and configuration that show the problem, the command you ran, what you expected and what happened. Use made-up names, never the real map of a real company, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- an input that makes the tool read a file other than the map and the configuration it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a web address, run a program, load a module or evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long or use unbounded memory, such as a very large file, a very long line, very many systems, flows or fields, or JSON or YAML nested very deep
- binary, UTF-16 or invalid UTF-8 input that the tool reads as if it were text
- an input that the tool fails to read and passes over without an error, such as an unknown key or a key named twice in the map or the configuration, or YAML outside the subset read as something else
- a run that passes although shared data has no owner or two, a flow writes into the record of another system with no approved exception, or a rule runs or does not run against docs/method.md
- text from the map or a file name that rewrites the terminal through control or direction characters, starts or ends a GitHub workflow command, or is shown unescaped in the output
- a name such as `__proto__` that changes how objects behave inside the tool
- an output that changes with the clock, the time zone or the locale of the machine

Out of scope: whether the map is true to the systems, whether the reason of an exception is a good one, who may change the map or the configuration in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
