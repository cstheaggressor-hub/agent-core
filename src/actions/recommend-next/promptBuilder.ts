import type { RecommendNextPromptInput, RecommendNextPromptMessages, RecommendNextPromptSource } from "./types.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function clip(value: string, max = 5000): string {
  return value.length > max ? `${value.slice(0, max)}\n...<truncated>` : value;
}

function graphPromptRoutingGuidance(context: unknown): RecommendNextPromptSource | null {
  const record = context && typeof context === "object" ? context as Record<string, unknown> : {};
  if (record.task_type !== "graph_session_chat" && record.prompt_kind !== "graph_session_followup") return null;
  return {
    name: "graph_session_prompt_routing_policy",
    priority: 95,
    content: {
      required_action: "session.route_prompt",
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

export function buildRecommendNextPrompt(input: RecommendNextPromptInput): RecommendNextPromptMessages {
  const routingGuidance = graphPromptRoutingGuidance(input.context.context);
  const sources: RecommendNextPromptSource[] = [
    { name: "current_context", priority: 100, content: input.context },
    ...(routingGuidance ? [routingGuidance] : []),
    {
      name: "action_catalog",
      priority: 90,
      content: input.action_catalog.map((action) => ({
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
          "For graph_session_chat follow-ups, normally choose session.route_prompt and set its params.route.",
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
