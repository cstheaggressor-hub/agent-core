# Visible actions and prompt routing

`visible_actions` is a platform-selected capability mask. It is not inferred from the user's prompt.

## Why this exists

Recommend-next can be used for several different decision phases:

- routing a follow-up prompt inside a graph session
- selecting an implementation action inside a work session
- choosing a validation action
- selecting a pull-request action
- deciding whether to ask for approval

Those phases may all receive similar user text. The platform therefore provides the action set for the current phase instead of asking the LLM to infer it.

## Graph-session chat routing

For `POST /api/session-graph/sessions/{session_id}/chat`, the platform is in a prompt-routing phase. The allowed action set is exactly:

```json
["session.route_prompt"]
```

The recommend-next request should include this mask:

```json
{
  "task_type": "unknown",
  "current_action": "session.route_prompt",
  "completed_actions": [],
  "visible_actions": ["session.route_prompt"],
  "context": {
    "decision_phase": "graph_session_prompt_routing",
    "prompt_kind": "graph_session_followup",
    "visible_actions": ["session.route_prompt"],
    "session_id": "...",
    "target_session_id": "...",
    "prompt": "..."
  }
}
```

`task_type` is descriptive metadata only. The routing action is unlocked by `visible_actions`, not by task-type inference.

## Routing output

`session.route_prompt` returns one of:

- `continue_active`: continue the active goal by creating or continuing work.
- `question_only`: record the follow-up without creating work or a new goal.
- `create_child_goal`: create a sub-goal under the active context.
- `create_sibling_goal`: create a separate root/sibling goal.

## Broader actions happen after routing

Actions such as `session.mount`, `session.adapt`, `apply_patch`, `run_tests`, and `create_pr` must not be visible in the routing pass. They may be shown in a later recommend-next call after the platform has selected the correct graph lane.
