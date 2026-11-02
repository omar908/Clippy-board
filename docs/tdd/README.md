# Technical Design Documents

TDDs describe **how** an architecture is implemented and extended. Related
[ADRs](../adr/README.md) record **why** the architecture was chosen and its
tradeoffs. Here, TDD means Technical Design Document, not test-driven development.

## Organization

- Keep each design in `NNNN-short-title.md`, using the next number in this index.
  TDD numbering is independent of ADR numbering; link the corresponding records.
- Keep small examples and extension instructions in the relevant TDD. Put large
  supporting assets in a matching `NNNN-short-title/` directory if needed.
- Link source files and test guides instead of copying their implementation.
- Update the TDD when interfaces or behavior change. Record a new architectural
  decision in an ADR when the rationale or constraints materially change.
- Use `Proposed` while design approval or required validation is pending,
  `Accepted` after approval, and `Superseded by TDD-NNNN` when replaced. Preserve
  superseded documents and link their replacements.
- Implementation on a branch and passing automated checks do not imply acceptance.
  Record outstanding validation explicitly and update both indexes on acceptance.

## Suggested structure

Include status/date, related ADR, scope and non-goals, module responsibilities,
interfaces and execution flow, data/persistence, failure and lifecycle behavior,
extension examples, and validation/acceptance criteria. Scale the detail to the
design; keep the ADR focused on the decision rather than duplicating this content.

## Index

| TDD | Title | Related ADR | Status |
|---|---|---|---|
| [0001](0001-commands-and-shortcuts.md) | Shared commands and shortcut routing | [0008](../adr/0008-shared-commands-and-shortcut-router.md) | Accepted |
