import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TREASURY_ANALYST_NAME,
  createLegacyTreasuryAnalystConversationConfig,
  createTreasuryAnalystConversationConfig,
  treasuryAnalystToolDefinitions,
} from "../src/integrations/treasury-analyst-agent.ts";
import {
  PERSONAL_BETTING_ANALYST_NAME,
  createLegacyPersonalBettingAnalystConversationConfig,
  createPersonalBettingAnalystConversationConfig,
  personalBettingAnalystToolDefinitions,
} from "../src/integrations/personal-betting-analyst-agent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = path.join(root, ".env.local");
const envExamplePath = path.join(root, ".env.example");
const apiBase = "https://api.elevenlabs.io/v1/convai";

function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function upsertEnvValue(text: string, key: string, value: string) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) {
    return text.replace(pattern, `${key}=${value}`);
  }
  return `${text.replace(/\s*$/, "")}\n${key}=${value}\n`;
}

function permissionError(status: number) {
  return status === 401 || status === 403;
}

async function elevenLabsRequest(
  apiKey: string,
  method: string,
  pathname: string,
  body?: unknown,
) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { error: text };
    }
  }
  return { response, payload, text };
}

function failForStatus(action: string, status: number, body: string): never {
  if (permissionError(status)) {
    throw new Error(
      `ElevenLabs API key is missing Conversational AI / Agents permission (${action} failed with ${status}). Create a key with Agents access, then re-run npm run analyst:provision.`,
    );
  }
  throw new Error(`${action} failed with status ${status}: ${body}`);
}

function toolIdFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (typeof record.tool_id === "string") return record.tool_id;
  const tool = record.tool;
  if (tool && typeof tool === "object" && "id" in tool) {
    const id = (tool as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

function listedTools(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const tools = Array.isArray(record.tools) ? record.tools : [];
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object") return [];
    const item = tool as Record<string, unknown>;
    const id = toolIdFrom(item);
    const config =
      item.tool_config && typeof item.tool_config === "object"
        ? (item.tool_config as Record<string, unknown>)
        : item;
    const name = typeof config.name === "string" ? config.name : null;
    if (!id || !name) return [];
    return [{ id, name }];
  });
}

async function syncClientTools(
  apiKey: string,
  definitions: typeof treasuryAnalystToolDefinitions | typeof personalBettingAnalystToolDefinitions,
) {
  const listed = await elevenLabsRequest(apiKey, "GET", "/tools");
  const existing = listed.response.ok ? listedTools(listed.payload) : [];
  const ids: string[] = [];

  for (const tool of definitions) {
    const current = existing.find((item) => item.name === tool.name);
    const toolConfig = {
      type: "client",
      name: tool.name,
      description: tool.description,
      expects_response: tool.expects_response,
      parameters: tool.parameters,
    };

    if (current) {
      const updated = await elevenLabsRequest(
        apiKey,
        "PATCH",
        `/tools/${current.id}`,
        { tool_config: toolConfig },
      );
      if (!updated.response.ok) {
        failForStatus(
          `Update tool ${tool.name}`,
          updated.response.status,
          updated.text,
        );
      }
      ids.push(toolIdFrom(updated.payload) ?? current.id);
      continue;
    }

    const created = await elevenLabsRequest(apiKey, "POST", "/tools", {
      tool_config: toolConfig,
    });
    if (!created.response.ok) {
      failForStatus(
        `Create tool ${tool.name}`,
        created.response.status,
        created.text,
      );
    }
    const id = toolIdFrom(created.payload);
    if (!id) {
      throw new Error(`ElevenLabs did not return an id for tool ${tool.name}`);
    }
    ids.push(id);
  }

  return ids;
}

async function upsertNamedAgent(input: {
  apiKey: string;
  agentId: string | undefined;
  name: string;
  conversationConfig: Record<string, unknown>;
}) {
  const body = {
    name: input.name,
    conversation_config: input.conversationConfig,
  };

  if (input.agentId) {
    const updated = await elevenLabsRequest(
      input.apiKey,
      "PATCH",
      `/agents/${input.agentId}`,
      body,
    );
    if (updated.response.ok) {
      return input.agentId;
    }
    if (updated.response.status === 400) {
      const fallback = await elevenLabsRequest(
        input.apiKey,
        "PATCH",
        `/agents/${input.agentId}`,
        {
          name: input.name,
          conversation_config: {
            agent: (input.conversationConfig as { agent?: unknown }).agent,
          },
        },
      );
      if (fallback.response.ok) {
        console.warn(
          `${input.name}: turn settings rejected; updated prompt/tools only.`,
        );
        return input.agentId;
      }
      failForStatus(
        `Update ${input.name}`,
        fallback.response.status,
        fallback.text,
      );
    }
    if (updated.response.status !== 404) {
      failForStatus(
        `Update ${input.name}`,
        updated.response.status,
        updated.text,
      );
    }
  }

  const created = await elevenLabsRequest(
    input.apiKey,
    "POST",
    "/agents/create",
    body,
  );
  if (!created.response.ok) {
    failForStatus(`Create ${input.name}`, created.response.status, created.text);
  }
  const payload = created.payload as { agent_id?: string };
  if (!payload.agent_id) {
    throw new Error(`ElevenLabs did not return an agent_id for ${input.name}`);
  }
  return payload.agent_id;
}

async function main() {
  const [exampleText, localText] = await Promise.all([
    readFile(envExamplePath, "utf8").catch(() => ""),
    readFile(envLocalPath, "utf8").catch(() => ""),
  ]);
  const env = {
    ...parseEnv(exampleText),
    ...parseEnv(localText),
    ...process.env,
  };
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is missing. Put it in .env.local, then re-run npm run analyst:provision.",
    );
  }

  let treasuryToolIds: string[] | null = null;
  let personalToolIds: string[] | null = null;
  try {
    treasuryToolIds = await syncClientTools(
      apiKey,
      treasuryAnalystToolDefinitions,
    );
    personalToolIds = await syncClientTools(
      apiKey,
      personalBettingAnalystToolDefinitions,
    );
  } catch (error) {
    console.warn(
      error instanceof Error ? error.message : String(error),
      "\nFalling back to inline client tool definitions.",
    );
  }

  const treasuryConfig = treasuryToolIds
    ? createTreasuryAnalystConversationConfig(treasuryToolIds)
    : createLegacyTreasuryAnalystConversationConfig();
  const personalConfig = personalToolIds
    ? createPersonalBettingAnalystConversationConfig(personalToolIds)
    : createLegacyPersonalBettingAnalystConversationConfig();

  const treasuryAgentId = await upsertNamedAgent({
    apiKey,
    agentId: env.ELEVENLABS_AGENT_ID || undefined,
    name: TREASURY_ANALYST_NAME,
    conversationConfig: treasuryConfig,
  });
  const personalAgentId = await upsertNamedAgent({
    apiKey,
    agentId: env.ELEVENLABS_PERSONAL_AGENT_ID || undefined,
    name: PERSONAL_BETTING_ANALYST_NAME,
    conversationConfig: personalConfig,
  });

  let nextLocal =
    localText ||
    [
      "# Local secrets. Do not commit this file.",
      `ELEVENLABS_API_KEY=${apiKey}`,
      env.TAVILY_API_KEY ? `TAVILY_API_KEY=${env.TAVILY_API_KEY}` : "",
    ]
      .filter(Boolean)
      .join("\n") + "\n";
  nextLocal = upsertEnvValue(nextLocal, "ELEVENLABS_AGENT_ID", treasuryAgentId);
  nextLocal = upsertEnvValue(
    nextLocal,
    "ELEVENLABS_PERSONAL_AGENT_ID",
    personalAgentId,
  );
  await mkdir(path.dirname(envLocalPath), { recursive: true });
  await writeFile(envLocalPath, nextLocal, "utf8");
  console.log(
    `Treasury Analyst ready (${treasuryAgentId}). Personal Betting Analyst ready (${personalAgentId}). Wrote both IDs to .env.local.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
