export interface OnboardingStepDefinition {
  key: string;
  label: string;
  order: number;
}

export type ClaudeToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type BusinessPromptContext = {
  name: string;
  address: string | null;
  contactPhone: string | null;
};

export interface ModuleDefinition {
  key: string;
  buildSystemPrompt(business: BusinessPromptContext): string;
  getTools(): ClaudeToolDefinition[];
  onboardingSteps: OnboardingStepDefinition[];
}
