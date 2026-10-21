/**
 * AI features and how the server bills them. Shared by the client (to label each action)
 * and the server (which enforces it). Mirrors what the app charged before Phase 4:
 * 1 credit per user ACTION, whatever the number of model calls the action needs; the tools
 * that were free (course tools, Arena questions) stay free but get a daily quota.
 * Plans and prices are unchanged (src/constants.ts).
 */
export type AiBillingMode = 'credit' | 'included';

export interface AiFeatureRule {
  billing: AiBillingMode;
  /** Model calls allowed within one action (e.g. podcast = script + audio). */
  maxCalls: number;
}

export const AI_FEATURES = {
  study: { billing: 'credit', maxCalls: 1 },           // AIStudyView: summary, plan, flashcards, exam, exercises, diagram
  podcast: { billing: 'credit', maxCalls: 2 },         // PodcastView: script + audio
  voice_assistant: { billing: 'credit', maxCalls: 2 }, // VoiceAssistant: answer + speech
  virtual_tutor: { billing: 'credit', maxCalls: 1 },
  math: { billing: 'credit', maxCalls: 1 },
  books: { billing: 'credit', maxCalls: 1 },
  maps: { billing: 'credit', maxCalls: 1 },            // MultimediaGenerator: search / identify location
  course_tools: { billing: 'included', maxCalls: 8 },  // CourseDetail tools ("generate all" = 6 calls), free before Phase 4
  arena_questions: { billing: 'included', maxCalls: 1 },
} as const satisfies Record<string, AiFeatureRule>;

export type AiFeature = keyof typeof AI_FEATURES;

/** Used when a call site does not label its action (keeps the previous free behavior). */
export const DEFAULT_AI_FEATURE: AiFeature = 'course_tools';

export interface AiBilling {
  feature: AiFeature;
  /** One id per user action: every model call of that action shares it (charged once). */
  actionId: string;
}

export const isAiFeature = (value: unknown): value is AiFeature =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(AI_FEATURES, value);
