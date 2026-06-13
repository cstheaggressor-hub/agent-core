# Next-task decision contract (v0002)

The LLM output schema for `POST /actions/recommend-next`.

## Output shape

```json
{
  "decision": "execute | find_out_more | ask_user | stop",
  "task_name": "string (from available_tasks, or 'stop')",
  "params": {},
  "certainty": 0.0,
  "stakes": "read_only | execution | modification | external_side_effect",
  "risk": "low | medium | high",
  "reason": "short user-visible rationale",
  "progress_note": "optional narration",
  "missing_information": [],
  "expected_result": "string",
  "success_criteria": [],
  "forbidden_actions": []
}
```

Validated by `NextActionWithSessionUpdateSchema` in `src/sessions/sessionUpdateProposal.ts`.

## Decision semantics

| decision | effect |
|----------|--------|
| `execute` | Platform validates then executes `task_name` with `params`. |
| `find_out_more` | Low-risk read-only task to increase certainty. |
| `ask_user` | Maps to the `ask_user` action with a `question` param. |
| `stop` | Terminal — no action emitted, no workflow started. |

## Backward compatibility

The engine returns both `next_task_decision` (v0002) and `recommendation` (legacy `action_name` shape). Consumers should prefer `next_task_decision` but the legacy field is preserved for existing callers.

## visible_actions

Selected by the platform phase, **not** inferred from the user prompt. See `visible-actions-routing.md`.

## Platform boundary

All recommendations are advisory (`advisory_only: true`, `requires_platform_validation: true`). agent-core must not execute, commit, push, deploy, or perform approvals. The control plane validates before acting.
