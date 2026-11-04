# Contributor guidance

Read `README.md` first for the current phase and entry points. Before changing product behavior, read the relevant product brief and the applicable technical and event contracts in full. Those documents define current scope, terminology, trust boundaries, and planned behavior.

## Scope and evidence

- Confirm the repository, branch, base revision, and existing changes before editing. Follow the task's scope and preserve unrelated work.
- Treat event content as producer-reported unless the product records a specific verification basis. Keep configured model/effort distinct from runtime-reported or tool-verified values; a receipt confirms ledger acceptance only. Preserve unknown, conflicting, and unavailable data without inferring missing facts.
- Keep records and views inspectable with links to their source events. Collect only structured diagnostic metadata needed for the stated task; do not collect or upload transcripts, prompts, secrets, or private conversation content.
- Follow the current phase in `README.md` and the approved task scope. A plan or published repository does not establish that an application, collector, or integration exists.

## Checks and handoff

- Inspect repository manifests and instructions to find real setup and validation commands. Run proportionate checks for the change; report exact commands, revision, outcomes, and limits. Mark unavailable commands as unavailable rather than inventing them.
- Review the complete diff before handoff. For a pull request, use an English title and description that state the change, checks, and limitations. Request independent review of the exact proposed revision; address findings within scope and rerun affected checks before merge.
