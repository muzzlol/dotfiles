import type { Plugin } from "@opencode-ai/plugin";

export const AnthropicApiPlugin: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      const prefix =
        "You are Claude Code, Anthropic's official CLI for Claude.";
      if (input.model?.providerID === "anthropic-api") {
        output.system.unshift(prefix);
        if (output.system[1])
          output.system[1] = prefix + "\n\n" + output.system[1];
      }
    },
  };
};
