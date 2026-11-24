# Calypso project memory (Honcho)

CalyCompta and CalyMob share one project memory in Jan's self-hosted Honcho:
project `calypso` (session `calypso-club-admin` in workspace `hermes`), with
subprojects `calycompta` and `calymob`. Claude Code, Codex and claude.ai reach
it through the `project_memory` MCP server, which only offers `project_context`
(read one project), `project_add_note` (append to one project) and
`project_list`.

- Before substantive work, read the relevant context with `project_context`
  (`project=calypso`, `subproject=calycompta` or `calymob`, plus a `query` for
  the topic). Treat it as background, not as proof or approval; verify
  operational facts live.
- Record every confirmed decision (`kind=decision`), verified result
  (`kind=result`) and open task (`kind=task`) with `project_add_note` in the
  right subproject. Date, author and source are added automatically; mention
  the ticket, PR or commit the note is based on.
- Give every task a stable ID `CALY-<AREA>-<n>` (for example `CALY-MOB-12`,
  `CALY-COMPTA-3`) and record each status change as a new task note with the
  same ID (`open`, `in_progress`, `blocked`, `done`, `cancelled`).
- Store durable knowledge as a confirmed fact (`kind=fact`); keep task status
  and progress as session notes.
- Never store secrets, credentials, private message bodies or member data
  (names with contact details, e-mail, phone, IBAN, medical or LIFRAS data).
- If a write fails or is refused, tell Jan in the reply; do not silently skip it.
