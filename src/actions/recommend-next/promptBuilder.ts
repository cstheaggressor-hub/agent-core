import type { RecommendNextPromptInput, RecommendNextPromptMessages, RecommendNextPromptSource } from "./types.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function clip(value: string, max = 5000): string {
  return value.length > max ? `${value.slice(0, max)}\n...<truncated>` : value;
}

function graphPromptRoutingGuidance(input: RecommendNextPromptInput): RecommendNextPromptSource | null {
  const record = input.context.context && typeof input.context.context === "object" ? input.context.context as Record<string, unknown> : {};
  const routeOnlyPass = (input.visible_actions ?? []).includes("session.route_prompt");
  if (!routeOnlyPass && record.prompt_kind !== "graph_session_followup") return null;
  return {
    name: "graph_session_prompt_routing_policy",
    priority: 95,
    content: {
      required_action: "session.route_prompt",
      source_of_truth: "visible_actions/call-site phase, not inferred task_type",
      routes: {
        continue_active: "Use for ordinary follow-up implementation, refinement, validation, or execution under the current session goal.",
        question_only: "Use for explanation, reasoning, status, or clarification prompts where no work item or new goal should be created.",
        create_child_goal: "Use when the user explicitly asks to track a separate subtask under the same repo/context.",
        create_sibling_goal: "Use when the user explicitly asks for a new session, unrelated task, different goal, or separate root objective.",
      },
      invariant: "Initial home prompts create goal sessions in the platform. Follow-up chat is routed through recommend-next before the platform mutates the graph.",
      params_contract: {
        route: "one of continue_active | question_only | create_child_goal | create_sibling_goal",
        target_session_id: "current graph session id",
        prompt: "the user's follow-up prompt",
        reason: "short explanation for the selected route",
      },
    },
  };
}

function visibleActionCatalog(input: RecommendNextPromptInput) {
  const visible = new Set(input.visible_actions ?? []);
  if (visible.size === 0) return input.action_catalog;
  return input.action_catalog.filter((action) => visible.has(action.name));
}

export function buildRecommendNextPrompt(input: RecommendNextPromptInput): RecommendNextPromptMessages {
  const routingGuidance = graphPromptRoutingGuidance(input);
  const actionCatalog = visibleActionCatalog(input);
  const sources: RecommendNextPromptSource[] = [
    { name: "current_context", priority: 100, content: input.context },
    ...(routingGuidance ? [routingGuidance] : []),
    ...(input.visible_actions && input.visible_actions.length > 0 ? [{ name: "visible_actions", priority: 92, content: input.visible_actions }] : []),
    {
      name: "action_catalog",
      priority: 90,
      content: actionCatalog.map((action) => ({
        name: action.name,
        description: action.description,
        risk: action.risk,
        side_effects: action.side_effects,
        params_json_schema: action.params_json_schema,
      })),
    },
    { name: "active_visible_plan", priority: 80, content: input.active_plan ?? null },
    { name: "suggested_plan", priority: 70, content: input.suggested_plan ?? null },
    { name: "recent_outcomes", priority: 60, content: input.recent_outcomes ?? [] },
    { name: "memories", priority: 50, content: input.memories ?? [] },
    { name: "session_graph_projection", priority: 40, content: input.session_graph_projection ?? null },
    ...(input.additional_sources ?? []),
  ].sort((a, b) => b.priority - a.priority);

  const sourceText = sources.map((source) => `## ${source.name}\n${clip(safeJson(source.content))}`).join("\n\n");

  return {
    sources,
    messages: [
      {
        role: "system",
        content: [
          "You are the recommend-next engine for an autonomous coding platform.",
          "Choose exactly one next action. Do not return a multi-step plan.",
          "Only choose from the rendered action_catalog. If visible_actions is present, no other actions are available.",
          "If visible_actions contains only session.route_prompt, this is a routing pass; choose session.route_prompt regardless of broad task_type uncertainty.",
          "The visible plan is advisory UI state. It may guide you, but execution must follow your single next-action decision.",
          "If your selected action deviates from the active or suggested plan, set requires_plan_revision=true and explain why.",
          "Return strict JSON with action_name, params, confidence, rationale, plan_alignment, aligned_plan_step_ids, deviation_reason, requires_plan_revision.",
        ].join("\n"),
      },
      {
        role: "user",
        content: sourceText,
      },
    ],
  };
}
