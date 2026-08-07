import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword,
  select as inquirerSelect,
} from '@inquirer/prompts';

export interface PromptChoice<Value> {
  name: string;
  value: Value;
  description?: string;
  disabled?: boolean | string;
}

export interface PromptService {
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  input(
    message: string,
    options?: { defaultValue?: string; validate?: (value: string) => boolean | string },
  ): Promise<string>;
  password(message: string, validate?: (value: string) => boolean | string): Promise<string>;
  select<Value>(
    message: string,
    choices: PromptChoice<Value>[],
    defaultValue?: Value,
  ): Promise<Value>;
}

export class InquirerPromptService implements PromptService {
  confirm(message: string, defaultValue = false): Promise<boolean> {
    return inquirerConfirm({ message, default: defaultValue });
  }

  input(
    message: string,
    options: { defaultValue?: string; validate?: (value: string) => boolean | string } = {},
  ): Promise<string> {
    return inquirerInput({
      message,
      default: options.defaultValue,
      validate: options.validate,
    });
  }

  password(message: string, validate?: (value: string) => boolean | string): Promise<string> {
    return inquirerPassword({ message, mask: '*', validate });
  }

  select<Value>(
    message: string,
    choices: PromptChoice<Value>[],
    defaultValue?: Value,
  ): Promise<Value> {
    return inquirerSelect({ message, choices, default: defaultValue });
  }
}
