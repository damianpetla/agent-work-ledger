# Product brief

## Purpose and first user

Agent Work Ledger helps a person supervising agent work understand who delegated to whom, what happened to a task and what the received records say is waiting. Today that person must search long chats or request repeated AI summaries. The intended alternative is explicit structured events with deterministic views and analysis, inspectable without an AI service.

The first user is an individual running a small agent workflow locally. The product must remain useful with arbitrary actors, role labels, task systems and agent providers. It is an independent public MIT project. Future self-hosting is a direction, not a prerequisite for local evaluation.

## Current boundary and next evaluation

DAM-30 ordinary D is accepted on main `9656cc61e51d804b6e63f9518deaf1ce06171489`. It presents strict accepted v1 events from a bundled synthetic example and independent files, source-linked relations/attempts, timeline and separate current-tab receipts. File workspaces remain in browser memory; reload resets them. Historical author evidence remains in the repository, and acceptance is the delivery owner's decision.

The next authorized implementation outcome, DAM-32, adds local installation, explicit project/whole-task session registration, real MCP reporting, durable receipts/history and ordinary-D inspection after reload/service restart. DAM-37/38 deliver the shared core and integration. This documentary contract revision itself implements none of those service paths. The [service contract](ledger-api.md) and [local setup/support](local-service.md) define the bounded path and truthful evidence boundary.

## Terminology

| Term | Meaning |
| --- | --- |
| Actor | An identified person, agent or tool; a role is a configurable label, not an access grant. |
| Project | Explicit registered organizational context, identified independently of its display name. |
| Session | One explicitly registered whole-task journey, covering multiple agents, runs and attempts; distinct from a protocol connection or browser tab. |
| Task | A stable unit of intended work, optionally associated with an external ticket; explicitly bound to exactly one registered session in the first durable contract. |
| Run | One execution assigned to an actor for a task. |
| Attempt | A distinct try or revision within a run; retries of event delivery do not create new work attempts. |
| Event | An identified record of an occurrence or assertion, correlated to the relevant task, run, attempt and related event when known. |
| Delegation | An explicit transfer or assignment of work from one actor to another. |
| Consultation | A request for information or advice; it does not itself transfer responsibility. |
| Reported state | A deterministic interpretation of received events, with uncertainty visible; it is not observation of the live execution. |

The technical contract defines exact identifiers, cardinality and validation. Missing identifiers or evidence must not be invented to make a graph look complete.

## Durable requirements

Events must preserve identity and correlations across repeated imports and delivery retries. Repeating the same event must not duplicate it; conflicting content under an existing identity must produce an explicit error rather than silent replacement. Invalid input must have actionable feedback. Ordering must remain deterministic for ties and out-of-order reports. Reported occurrence time and locally recorded receipt/import time have different meanings and must remain distinguishable.

Views must link their conclusions back to source records. The intended task view includes a timeline and, in the amended first result, a labelled graph covering delegation, consultation, block/resolution, review, QA and rework. Revisions must remain distinct: earlier review/QA evidence does not automatically apply to a new attempt. Waiting reason and next responsible actor are shown only when the received records support them; missing or conflicting information remains unknown or ambiguous.

Record the source and provenance of assertions, including whether information is declared or independently tool-verified and the basis of that verification. Confidence must be expressed with its source or as unknown, not as an invented numeric probability. Configured model/effort and verified runtime model/effort are separate facts; either may be unavailable. A successful event receipt proves receipt, not the truth of the producer's assertion. Self-reports cannot prove review quality, independence or actual completion. Unknown never means pass.

Collect structured diagnostic metadata needed for the task rather than transcripts, secrets or private prompt contents. Reporting must be explicit and opt-in. Local inspection must not depend on an AI evaluator.

## Product sequence

Delivery issues own current status/acceptance, not this document. DAM-30 provides accepted local D. DAM-32 is the next small local MCP/persistent-project-session vertical, with DAM-37 shared core and DAM-38 client/ordinary-view/install integration. Waiting/next-actor summaries remain independent DAM-31 and do not block MCP. DAM-39 subsequently validates self-hosted installation/security in isolation without deploying the user's VPS; DAM-40 adds richer project/day browsing using the same history store. No second history backend or preliminary HTTP-producer user trial is needed.

A new evaluator follows public local instructions, connects the pinned real MCP client, registers one project and whole-task session, reports a safe synthetic journey with multiple actors/runs and inspects those exact records/first receipts in ordinary D after restart/retry. Independent core QA precedes consumer integration; integrated QA and actual user evaluation remain separate DAM-32 gates. Successful transport alone proves neither producer truth nor agent independence. Studio-specific reporting/integration follows independent MCP acceptance using the public product guide, and remains outside this outcome.

## Exclusions and later questions

The product is not an orchestration engine, billing system, transcript collector, AI evaluator or dashboard for an entire software factory. It does not enforce roles or independence, schedule work, collect agent data automatically, deploy to a VPS or integrate with a particular factory. Deterministic anomaly indicators can follow evidence from the first evaluation; rules and thresholds are not promised yet.

The service contract and support document settle the first durable runtime, registration/cardinality, unchanged event schema, receipt/storage/recovery and supported real-client path. Public setup instructions and proportionate independent verification must accompany each usable result. Planned QA and user trials are requirements, not test results.
