import type { ActionDefinition, ActionRecommendation, ActionRecommendationContext } from "../../providers/ActionKnowledgeProvider.js";

const ROOT_PHRASES = ["new session", "new root", "separate session", "different goal", "unrelated task", "unrelated goal", "start over"];
const CHILD_PHRASES = ["separate task", "child task", "subtask", "also create a task", "track this separately"];
const QUESTION_PREFIXES = ["why ", "what ", "how ", "where ", "when ", "who ", "is ", "are ", "can you explain", "explain ", "reason out"];
const ACTION_WORDS = new Set(["continue", "implement", "fix", "add", "remove", "change", "update", "refactor", "run", "test", "create", "build"]);

function chooseRoute(prompt: string): { route: string; reason: string; confidence: number } {
  const text = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  if (ROOT_PHRASES.some((phrase) => text.includes(phrase))) {
    return { route: "create_sibling_goal", reason: "User explicitly requested a separate or unrelated goal.", confidence: 0.78 };
  }
  if (CHILD_PHRASES.some((phrase) => text.includes(phrase))) {
    return { route: "create_child_goal", reason: "User explicitly requested a separately tracked subtask.", confidence: 0.76 };
  }
  const questionLike = text.endsWith("?") || QUESTION_PREFIXES.some((prefix) => text.startsWith(prefix));
  const hasActionWord = text.split(/\s+/).some((word) => ACTION_WORDS.has(word));
  if (questionLike && !hasActionWord) {
    return { route: "question_only", reason: "Prompt is explanatory or clarifying rather than action-oriented.", confidence: 0.74 };
  }
  return { route: "continue_active", reason: "Prompt appears to continue the active session goal.", confidence: 0.7 };
}

export function graphPromptRouteFallbackRecommendation(context: ActionRecommendationContext, catalog: ActionDefinition[]): ActionRecommendation | null {
  if (context.task_type !== "graph_session_chat") return null;
  const prompt = String(context.context.prompt ?? context.context.user_prompt ?? "").trim();
  const sessionId = String(context.context.session_id ?? context.context.target_session_id ?? "").trim();
  if (!prompt || !sessionId) return null;
  if (!catalog.some((candidate) => candidate.name === "session.route_prompt")) return null;
  const route = chooseRoute(prompt);
  return {
    action_name: "session.route_prompt",
    params: { route: route.route, target_session_id: sessionId, prompt, reason: route.reason },
    schema_valid: true,
    requires_platform_validation: true,
    requires_approval: false,
    confidence: route.confidence,
    rationale: route.reason,
  };
}
