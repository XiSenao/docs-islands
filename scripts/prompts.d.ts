declare module 'prompts' {
  interface Choice {
    title: string;
    value: string;
    selected?: boolean;
    description?: string;
  }

  interface MultiselectPrompt {
    type: 'multiselect';
    name: string;
    message: string;
    choices: Choice[];
    min?: number;
  }

  interface PromptOptions {
    onCancel?: () => void;
  }

  export default function prompts<Result extends Record<string, unknown>>(
    prompt: MultiselectPrompt,
    options?: PromptOptions,
  ): Promise<Result>;
}
