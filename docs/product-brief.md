# Product brief

## Purpose and first user

Agent Work Ledger helps a person supervising agent work understand who delegated to whom, what happened to a task and what the received records say is waiting. Today that person must search long chats or request repeated AI summaries. The intended alternative is explicit structured events with deterministic views and analysis, inspectable without an AI service.

The first user is an individual running a small agent workflow locally. The product must remain useful with arbitrary actors, role labels, task systems and agent providers. It is an independent public MIT project. Future self-hosting is a direction, not a prerequisite for local evaluation.

## Current boundary and first evaluation

The repository includes a local file timeline and source inspector with synthetic examples. Independent source review, integrated QA and user evaluation are separate gates; author checks alone do not establish acceptance. Live reporting, graphs and deployment remain unimplemented.

First trial: load the supplied local example and identify the delegation, reported block and unknown runtime model from its timeline.

The example is explicitly synthetic and loads through the ordinary documented input path. The evaluator can inspect source records and repeat the import, including invalid and duplicate inputs. This evaluates local interpretation and usability; it does not demonstrate a live agent connection. No external account, AI call or private conversation history should be needed.

## Terminology

| Term | Meaning |
| --- | --- |
| Actor | An identified person, agent or tool; a role is a configurable label, not an access grant. |
| Task | A stable unit of intended work, optionally associated with an external ticket. |
| Run | One execution assigned to an actor for a task. |
| Attempt | A distinct try or revision within a run; retries of event delivery do not create new work attempts. |
| Event | An identified record of an occurrence or assertion, correlated to the relevant task, run, attempt and related event when known. |
| Delegation | An explicit transfer or assignment of work from one actor to another. |
| Consultation | A request for information or advice; it does not itself transfer responsibility. |
| Reported state | A deterministic interpretation of received events, with uncertainty visible; it is not observation of the live execution. |

The technical contract will define exact identifiers, cardinality and validation. Missing identifiers or evidence must not be invented to make a graph look complete.

## Durable requirements

Events must preserve identity and correlations across repeated imports and delivery retries. Repeating the same event must not duplicate it; conflicting content under an existing identity must produce an explicit error rather than silent replacement. Invalid input must have actionable feedback. Ordering must remain deterministic for ties and out-of-order reports. Reported occurrence time and locally recorded receipt/import time have different meanings and must remain distinguishable.

Views must link their conclusions back to source records. The intended task view includes a timeline and, in a subsequent result, a labelled graph covering delegation, consultation, block/resolution, review, QA and rework. Revisions must remain distinct: earlier review/QA evidence does not automatically apply to a new attempt. Waiting reason and next responsible actor are shown only when the received records support them; missing or conflicting information remains unknown or ambiguous.

Record the source and provenance of assertions, including whether information is declared or independently tool-verified and the basis of that verification. Confidence must be expressed with its source or as unknown, not as an invented numeric probability. Configured model/effort and verified runtime model/effort are separate facts; either may be unavailable. A successful event receipt proves receipt, not the truth of the producer's assertion. Self-reports cannot prove review quality, independence or actual completion. Unknown never means pass.

Collect structured diagnostic metadata needed for the task rather than transcripts, secrets or private prompt contents. Reporting must be explicit and opt-in. Local inspection must not depend on an AI evaluator.

## Product sequence

The following describes product boundaries, not a second backlog or an implementation commitment. Delivery issues own acceptance, dependencies and current progress.

1. **Inspect a local task timeline.** Load a documented local event file and synthetic example, inspect source/provenance and handle malformed, repeated or conflicting input. Excludes graph, derived owner, live collection and MCP.
2. **Trace a task chain.** Add a linked delegation/consultation graph, revisions and received-record waiting summary after the timeline is accepted. Excludes real producer reporting, orchestration and automatic anomaly diagnosis.
3. **Receive one local producer's reports.** Exercise a real documented client boundary with safe synthetic content, receipt/error feedback, retry identity and persistence across restart, then inspect the same events. Fixtures alone cannot establish this result.

Product recommendation: evaluate local input/view before adding MCP. Tech Lead must explicitly choose the transport, assess the size of the third result and decide whether a generic MCP adapter and reusable reporting skill fit it or need a separate later release. No technical implementation is selected here. Factory-specific integration should occur only after the independent tool is built, tested and usable through its public instructions.

## Exclusions and later questions

The initial delivery is not an orchestration engine, billing system, transcript collector, AI evaluator or dashboard for an entire software factory. It does not enforce roles or independence, schedule work, collect agent data automatically, deploy to a VPS or integrate with a particular factory. Deterministic anomaly indicators can follow evidence from the first evaluation; rules and thresholds are not promised yet.

Before implementation, technical planning must settle the minimal local runtime and supported platform, event schema/versioning and correlation rules, import/receipt semantics, storage/recovery and ordering rules, source-verification representation, and the smallest real-producer path. Public setup instructions and proportionate independent verification must accompany each usable result. Planned QA and user trials are requirements, not test results.
