/**
 * Dynamic token budget calculation for Anthropic API calls.
 *
 * Strategy: estimate input token count from prompt length, then set
 * max_tokens = min(model_max_output, context_window - input_estimate - safety_buffer)
 *
 * This scales automatically as the corpus grows. When headroom is tight,
 * we warn and suggest a higher-tier model rather than silently truncating.
 * If no viable model exists at the current tier, we throw with actionable guidance.
 */

interface ModelLimits {
  contextWindow: number   // total tokens in + out
  maxOutput: number       // hard cap on output tokens for this model
  tier: number            // 1 = entry, 2 = mid, 3 = top — used to suggest upgrades
  displayName: string     // human-readable name for warnings
}

// Ordered upgrade paths: when a model is insufficient, suggest the next tier up
const MODEL_LIMITS: Record<string, ModelLimits> = {
  'claude-haiku-4-5':  { contextWindow: 200_000, maxOutput: 16_000, tier: 1, displayName: 'Claude Haiku'  },
  'claude-sonnet-4-5': { contextWindow: 200_000, maxOutput: 64_000, tier: 2, displayName: 'Claude Sonnet' },
  // Opus hard cap: 20,000 — SDK throws "streaming required" for non-streaming requests
  // when estimated time > 10 min: (3600 * tokens) / 128000 > 600s → tokens > 21,333.
  // 20k tokens ≈ 9.4 min estimated, safely under the guard.
  // 20k output tokens is still vastly more than our JSON schema needs (~6-10k typical).
  'claude-opus-4-6':   { contextWindow: 200_000, maxOutput: 20_000, tier: 3, displayName: 'Claude Opus'   },
}

// Suggested upgrade when a model's context window is insufficient
const UPGRADE_SUGGESTIONS: Record<string, string> = {
  'claude-haiku-4-5':  'Upgrade to Claude Sonnet (200K context, 64K output) or Claude Opus (200K context, 32K output).',
  'claude-sonnet-4-5': 'Upgrade to Claude Opus (200K context, 32K output). If corpus continues to grow beyond ~150K input tokens, consider splitting the synthesis into parallel sub-topic calls.',
  'claude-opus-4-6':   'Claude Opus is the highest Anthropic tier. Options: (1) split the corpus search into two batches and merge results, (2) reduce chunks from 20 → 12 and accept lower recall, (3) wait for next-generation models with larger context windows.',
}

const SAFETY_BUFFER  = 2_000   // reserve for system prompt overhead + estimation error
const MIN_OUTPUT     = 4_000   // minimum acceptable output headroom before we warn/error
const WARN_THRESHOLD = 8_000   // warn (but continue) if output headroom drops below this

/**
 * Estimate token count from a string.
 * ~3.5 chars/token for English/scientific prose — slightly conservative
 * vs OpenAI's 4.0 rule of thumb to account for JSON punctuation overhead.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

/**
 * Compute a safe max_tokens value for an Anthropic API call.
 *
 * - Logs input/output budget to console on every call.
 * - Warns when output headroom is tight and names a concrete upgrade path.
 * - Throws (loudly) if headroom falls below MIN_OUTPUT, with upgrade guidance.
 *
 * @param model   Anthropic model string (e.g. 'claude-opus-4-6')
 * @param prompt  Full user prompt
 * @param system  System prompt (estimated separately)
 */
export function computeMaxTokens(model: string, prompt: string, system = ''): number {
  const limits = MODEL_LIMITS[model]
  if (!limits) throw new Error(`Unknown model for token budget: ${model}`)

  const inputEstimate = estimateTokens(prompt) + estimateTokens(system) + SAFETY_BUFFER
  const available     = limits.contextWindow - inputEstimate
  const maxTokens     = Math.min(limits.maxOutput, available)

  console.log(
    `[tokens] ${limits.displayName} — ` +
    `input est: ${inputEstimate.toLocaleString()} tokens | ` +
    `output headroom: ${available.toLocaleString()} | ` +
    `max_tokens: ${maxTokens.toLocaleString()}`
  )

  if (available < MIN_OUTPUT) {
    const suggestion = UPGRADE_SUGGESTIONS[model] ?? 'Consider splitting this call into multiple smaller calls.'
    throw new Error(
      `[token budget] Prompt too large for ${limits.displayName}: ` +
      `~${inputEstimate.toLocaleString()} input tokens leaves only ${available.toLocaleString()} for output ` +
      `(minimum: ${MIN_OUTPUT.toLocaleString()}). ${suggestion}`
    )
  }

  if (available < WARN_THRESHOLD) {
    const suggestion = UPGRADE_SUGGESTIONS[model] ?? ''
    console.warn(
      `[tokens] ⚠️  Output headroom is tight for ${limits.displayName} ` +
      `(${available.toLocaleString()} tokens remaining). ` +
      `Results may be less detailed than optimal. ${suggestion}`
    )
  }

  return maxTokens
}
