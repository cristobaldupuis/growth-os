// api/_adapters.js — provider translation for the text proxy.
//
// ## The contract these preserve
//
// Twelve call sites build an Anthropic Messages request via buildRequest() and read
// an Anthropic response back: `data.content[]` blocks, `data.stop_reason`, and for
// the debate, `tool_use` blocks answered with `tool_result` blocks. `safeParseJSON`
// reads `content[0].text`.
//
// Routing a group to Gemini or OpenAI must not change any of that. So the adapters
// translate in both directions and normalise the response back INTO the Anthropic
// shape — the provider difference is absorbed here rather than spread across twelve
// files and a parser. The alternative, teaching every call site about three
// response formats, would make each new provider a twelve-file change and would put
// provider branching inside prompt code where it does not belong.
//
// ## The part that is genuinely hard
//
// Tool use, and only the debate group needs it. callAgentTurn hands the model
// portfolio tools, reads back `tool_use` blocks, executes them, and feeds
// `tool_result` blocks into the next turn. All three providers express that
// differently:
//
//   Anthropic  content blocks: {type:"tool_use", id, name, input}
//                              {type:"tool_result", tool_use_id, content}
//   Gemini     parts:          {functionCall:{name,args}}
//                              {functionResponse:{name,response}}   <- keyed by NAME
//   OpenAI     message fields: tool_calls:[{id,function:{name,arguments}}]
//                              a "tool" role message with tool_call_id
//
// Gemini is the awkward one: it answers a call by function *name*, with no call id,
// while the Anthropic shape the app speaks carries `tool_use_id`. So the Gemini
// adapter builds an id→name map from the assistant turns already in the message
// array and resolves each tool_result through it, rather than trying to encode the
// name inside a synthetic id and parse it back out. Correct regardless of what the
// ids look like, which matters because they are ours to invent.
//
// ## What is not translated
//
// `thinking` and `output_config.effort` are Anthropic parameters. Rather than
// dropping them here, the registry declares `adaptiveThinking:false` and
// `effort:false` for every non-Anthropic model, so buildRequest never emits them in
// the first place — the capability table is the single place that decides which
// parameters are legal, and adding a second silent stripping layer here would make
// it lie. Same for prompt caching: `cacheMinTokens: Infinity` on those models means
// the cache breakpoint never applies and `system` stays a plain string.

import { geminiConfigured, geminiNotConfiguredError, geminiEndpoint, geminiAuthHeaders } from "./_geminiAuth.js";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

/** `system` may be a string or Anthropic cache-block form. Flatten either to text. */
function systemText(system) {
  if (!system) return "";
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map(b => b?.text || "").join("");
  return "";
}

/** Anthropic message content is either a bare string or an array of blocks. */
const blocksOf = (content) =>
  typeof content === "string" ? [{ type: "text", text: content }] : (content || []);

/** Map every tool_use id in the conversation to the tool's name. */
function toolNamesById(messages) {
  const map = {};
  for (const m of messages || []) {
    for (const b of blocksOf(m.content)) {
      if (b.type === "tool_use" && b.id) map[b.id] = b.name;
    }
  }
  return map;
}

/** A tool_result's payload is a JSON string from the executor. Parse when possible. */
function parseToolContent(content) {
  if (typeof content !== "string") return content;
  try { return JSON.parse(content); } catch { return { result: content }; }
}

// -- Gemini --------------------------------------------------------------------

function geminiRequest(body) {
  const names = toolNamesById(body.messages);

  const contents = [];
  for (const m of body.messages || []) {
    const parts = [];
    for (const b of blocksOf(m.content)) {
      if (b.type === "text" && b.text) parts.push({ text: b.text });
      else if (b.type === "tool_use") parts.push({ functionCall: { name: b.name, args: b.input || {} } });
      else if (b.type === "tool_result") {
        parts.push({
          functionResponse: {
            name: names[b.tool_use_id] || "unknown_tool",
            // Gemini requires an object here; the executor hands back a JSON string.
            response: parseToolContent(b.content),
          },
        });
      }
    }
    if (!parts.length) continue;
    // Gemini has no "tool" role — a function response is a user turn carrying a
    // functionResponse part, which is what the loop above already produces.
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }

  const req = {
    contents,
    generationConfig: { maxOutputTokens: body.max_tokens },
  };

  const sys = systemText(body.system);
  if (sys) req.systemInstruction = { parts: [{ text: sys }] };

  if (body.tools?.length) {
    req.tools = [{
      functionDeclarations: body.tools.map(t => {
        const decl = { name: t.name, description: t.description };
        // Gemini rejects a parameters object with no properties. Every portfolio
        // tool today takes no arguments, so this is the normal path, not an edge.
        if (t.input_schema?.properties && Object.keys(t.input_schema.properties).length > 0) {
          decl.parameters = t.input_schema;
        }
        return decl;
      }),
    }];
  }
  return req;
}

function geminiResponse(json) {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  const content = [];
  let sawToolCall = false;
  parts.forEach((p, i) => {
    if (p.text) content.push({ type: "text", text: p.text });
    if (p.functionCall) {
      sawToolCall = true;
      // Ids are ours to invent — Gemini does not issue one. It only has to be
      // unique within the turn and resolvable back to a name, which
      // toolNamesById does on the next request.
      content.push({
        type: "tool_use",
        id: `gemini_${i}_${p.functionCall.name}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      });
    }
  });

  const finish = candidate?.finishReason;
  return {
    content,
    // The app branches on exactly this value to decide whether to run the tool loop.
    stop_reason: sawToolCall ? "tool_use" : finish === "MAX_TOKENS" ? "max_tokens" : "end_turn",
    usage: {
      input_tokens: json?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// -- OpenAI --------------------------------------------------------------------

function openaiRequest(body) {
  const messages = [];
  const sys = systemText(body.system);
  if (sys) messages.push({ role: "system", content: sys });

  for (const m of body.messages || []) {
    const blocks = blocksOf(m.content);
    const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
    const toolUses = blocks.filter(b => b.type === "tool_use");
    const toolResults = blocks.filter(b => b.type === "tool_result");

    // A tool_result block becomes its own message with the "tool" role — OpenAI
    // does not carry results inside a user turn the way Anthropic does.
    if (toolResults.length) {
      for (const r of toolResults) {
        messages.push({
          role: "tool",
          tool_call_id: r.tool_use_id,
          content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
        });
      }
      continue;
    }

    if (toolUses.length) {
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolUses.map(b => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        })),
      });
      continue;
    }

    messages.push({ role: m.role, content: text });
  }

  const req = {
    model: body.model,
    messages,
    // `max_tokens` is deprecated in favour of this on current models.
    max_completion_tokens: body.max_tokens,
  };

  if (body.tools?.length) {
    req.tools = body.tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    }));
  }
  return req;
}

// -- OpenRouter ----------------------------------------------------------------
//
// OpenRouter is OpenAI-compatible, so it reuses both translations above rather
// than getting its own pair. The one thing that does not carry over is the output
// ceiling: `max_completion_tokens` is OpenAI's current spelling, and a
// compatibility layer that does not recognise it will not error — it will accept
// the request with no ceiling at all and bill whatever the model chooses to
// write. That is the one failure here worth engineering against, so the older
// `max_tokens` is sent alongside it. Both name the same number, so whichever the
// host reads gives the same answer.
function openrouterRequest(body) {
  const req = openaiRequest(body);
  req.max_tokens = body.max_tokens;
  return req;
}

function openaiResponse(json) {
  const choice = json?.choices?.[0];
  const msg = choice?.message || {};
  const content = [];

  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const call of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(call.function?.arguments || "{}"); } catch { /* a malformed argument string is not worth failing the turn over */ }
    content.push({ type: "tool_use", id: call.id, name: call.function?.name, input });
  }

  return {
    content,
    stop_reason: choice?.finish_reason === "tool_calls" ? "tool_use"
      : choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
    usage: {
      input_tokens: json?.usage?.prompt_tokens ?? 0,
      output_tokens: json?.usage?.completion_tokens ?? 0,
    },
  };
}

// -- The adapter map -----------------------------------------------------------
//
// Same shape as the provider map in api/video.js: one entry per provider, and
// adding a fourth is a new entry rather than a change to the handler.
//
// `endpoint` and `headers` are functions because they read env vars and, for
// Gemini, embed the model id in the URL.

export const adapters = {
  anthropic: {
    keyVar: "ANTHROPIC_API_KEY",
    endpoint: () => "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    // The native shape. Passing the body through unchanged is what keeps this
    // refactor a no-op for the path that was already working.
    toRequest: (body) => body,
    fromResponse: (json) => json,
    errorOf: (json) => json?.error?.message,
  },

  gemini: {
    // Still the fallback var name proxy.js logs/reads by default; the actual
    // "is this provider usable" question is configured()'s, not this string's —
    // see api/_geminiAuth.js for the AI-Studio-vs-Vertex decision.
    keyVar: "GEMINI_API_KEY",
    configured: geminiConfigured,
    notConfiguredError: geminiNotConfiguredError,
    endpoint: geminiEndpoint,
    headers: geminiAuthHeaders,
    toRequest: geminiRequest,
    fromResponse: geminiResponse,
    errorOf: (json) => json?.error?.message,
  },

  openai: {
    keyVar: "OPENAI_API_KEY",
    endpoint: () => OPENAI_API,
    headers: (key) => ({ "Content-Type": "application/json", Authorization: `Bearer ${key}` }),
    toRequest: openaiRequest,
    fromResponse: openaiResponse,
    errorOf: (json) => json?.error?.message,
  },

  // Open-weights models we do not host ourselves. Named for the host rather than
  // the model, because the host is what the key and the endpoint belong to — a
  // second open-weights model served from here is a catalogue entry, not another
  // adapter.
  openrouter: {
    keyVar: "OPENROUTER_API_KEY",
    endpoint: () => OPENROUTER_API,
    headers: (key) => ({ "Content-Type": "application/json", Authorization: `Bearer ${key}` }),
    toRequest: openrouterRequest,
    // Same wire shape as OpenAI, including `choices[0].message.tool_calls`.
    fromResponse: openaiResponse,
    errorOf: (json) => json?.error?.message,
  },
};

// Exported for the unit tests, which assert the translation both ways rather than
// going near a network.
export const _internal = {
  geminiRequest, geminiResponse, openaiRequest, openaiResponse, openrouterRequest,
  toolNamesById, systemText,
};
