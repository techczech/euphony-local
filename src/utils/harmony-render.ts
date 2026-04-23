import {
  ALL_SPECIAL_TOKENS,
  decode as decodeHarmony,
  encode as encodeHarmony
} from 'gpt-tokenizer/encoding/o200k_harmony';
import type { HarmonyRenderResponse } from '../types/common-types';

export const HARMONY_RENDERER_NAME = 'o200k_harmony';

const HARMONY_RENDER_SPECIAL_TOKEN_OPTIONS = {
  allowedSpecial: ALL_SPECIAL_TOKENS
} as const;
const HARMONY_CONSTRAIN_MARKER = '<|constrain|>';
const HARMONY_START_TOKEN = '<|start|>';
const HARMONY_END_TOKEN = '<|end|>';
const HARMONY_CALL_TOKEN = '<|call|>';
const HARMONY_CHANNEL_TOKEN = '<|channel|>';
const HARMONY_MESSAGE_TOKEN = '<|message|>';

const isHarmonyEnumSchema = (schema: Record<string, unknown>): boolean =>
  Array.isArray(schema.enum) && schema.enum.length > 0;

const formatHarmonySchemaDefault = (
  schema: Record<string, unknown>,
  value: unknown
): string => {
  if (typeof value === 'string' && !isHarmonyEnumSchema(schema)) {
    return `default: ${JSON.stringify(value)}`;
  }
  if (typeof value === 'string') {
    return `default: ${value}`;
  }
  return `default: ${JSON.stringify(value)}`;
};

const jsonSchemaToTypeScript = (schema: unknown, indent = ''): string => {
  if (!schema || typeof schema !== 'object') {
    return 'any';
  }

  const schemaObject = schema as Record<string, unknown>;

  if (Array.isArray(schemaObject.oneOf)) {
    return schemaObject.oneOf
      .map((variant, index) => {
        let typeString = jsonSchemaToTypeScript(variant, `${indent}   `);
        if (
          variant &&
          typeof variant === 'object' &&
          (variant as Record<string, unknown>).nullable === true &&
          !typeString.includes('null')
        ) {
          typeString = `${typeString} | null`;
        }

        const comments: string[] = [];
        if (
          variant &&
          typeof variant === 'object' &&
          typeof (variant as Record<string, unknown>).description === 'string'
        ) {
          comments.push(
            String((variant as Record<string, unknown>).description)
          );
        }
        if (
          variant &&
          typeof variant === 'object' &&
          (variant as Record<string, unknown>).default !== undefined
        ) {
          comments.push(
            formatHarmonySchemaDefault(
              variant as Record<string, unknown>,
              (variant as Record<string, unknown>).default
            )
          );
        }

        const prefix = index === 0 ? `\n${indent} | ` : `\n${indent} | `;
        return `${prefix}${typeString}${
          comments.length > 0 ? ` // ${comments.join(' ')}` : ''
        }`;
      })
      .join('');
  }

  if (Array.isArray(schemaObject.type)) {
    const mappedTypes = schemaObject.type
      .filter((item): item is string => typeof item === 'string')
      .map(item => (item === 'integer' ? 'number' : item));
    if (mappedTypes.length > 0) {
      return mappedTypes.join(' | ');
    }
  }

  const schemaType =
    typeof schemaObject.type === 'string' ? schemaObject.type : null;
  if (schemaType === 'object') {
    const outputLines: string[] = [];
    if (typeof schemaObject.description === 'string') {
      outputLines.push(`${indent}// ${schemaObject.description}`);
    }
    outputLines.push('{');

    const properties =
      schemaObject.properties &&
      typeof schemaObject.properties === 'object' &&
      !Array.isArray(schemaObject.properties)
        ? (schemaObject.properties as Record<string, unknown>)
        : {};
    const requiredProperties = new Set(
      Array.isArray(schemaObject.required)
        ? schemaObject.required.filter(
            (property): property is string => typeof property === 'string'
          )
        : []
    );

    for (const [key, value] of Object.entries(properties)) {
      const propertySchema =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};

      if (typeof propertySchema.title === 'string') {
        outputLines.push(`${indent}// ${propertySchema.title}`);
        outputLines.push(`${indent}//`);
      }
      if (
        !Array.isArray(propertySchema.oneOf) &&
        typeof propertySchema.description === 'string'
      ) {
        outputLines.push(`${indent}// ${propertySchema.description}`);
      }
      if (
        Array.isArray(propertySchema.examples) &&
        propertySchema.examples.length > 0
      ) {
        outputLines.push(`${indent}// Examples:`);
        for (const example of propertySchema.examples) {
          if (typeof example === 'string') {
            outputLines.push(`${indent}// - ${JSON.stringify(example)}`);
          }
        }
      }

      const optionalMarker = requiredProperties.has(key) ? '' : '?';
      if (Array.isArray(propertySchema.oneOf)) {
        if (typeof propertySchema.description === 'string') {
          outputLines.push(`${indent}// ${propertySchema.description}`);
        }
        if (propertySchema.default !== undefined) {
          outputLines.push(
            `${indent}// ${formatHarmonySchemaDefault(propertySchema, propertySchema.default)}`
          );
        }
        outputLines.push(`${indent}${key}${optionalMarker}:`);
        for (const variant of propertySchema.oneOf) {
          let typeString = jsonSchemaToTypeScript(variant, `${indent}   `);
          if (
            variant &&
            typeof variant === 'object' &&
            (variant as Record<string, unknown>).nullable === true &&
            !typeString.includes('null')
          ) {
            typeString = `${typeString} | null`;
          }
          const comments: string[] = [];
          if (
            variant &&
            typeof variant === 'object' &&
            typeof (variant as Record<string, unknown>).description === 'string'
          ) {
            comments.push(
              String((variant as Record<string, unknown>).description)
            );
          }
          if (
            variant &&
            typeof variant === 'object' &&
            (variant as Record<string, unknown>).default !== undefined
          ) {
            comments.push(
              formatHarmonySchemaDefault(
                variant as Record<string, unknown>,
                (variant as Record<string, unknown>).default
              )
            );
          }
          outputLines.push(
            `${indent} | ${typeString}${
              comments.length > 0 ? ` // ${comments.join(' ')}` : ''
            }`
          );
        }
        outputLines.push(`${indent},`);
        continue;
      }

      let typeString = jsonSchemaToTypeScript(value, `${indent}    `);
      if (propertySchema.nullable === true && !typeString.includes('null')) {
        typeString = `${typeString} | null`;
      }

      const defaultComment =
        propertySchema.default !== undefined
          ? ` // ${formatHarmonySchemaDefault(propertySchema, propertySchema.default)}`
          : '';
      outputLines.push(
        `${indent}${key}${optionalMarker}: ${typeString},${defaultComment}`
      );
    }

    outputLines.push(`${indent}}`);
    return outputLines.join('\n');
  }

  if (schemaType === 'string') {
    if (Array.isArray(schemaObject.enum)) {
      const enumValues = schemaObject.enum
        .filter((item): item is string => typeof item === 'string')
        .map(item => JSON.stringify(item));
      if (enumValues.length > 0) {
        return enumValues.join(' | ');
      }
    }
    return 'string';
  }

  if (schemaType === 'number' || schemaType === 'boolean') {
    return schemaType;
  }

  if (schemaType === 'integer') {
    return 'number';
  }

  if (schemaType === 'array') {
    return schemaObject.items
      ? `${jsonSchemaToTypeScript(schemaObject.items, indent)}[]`
      : 'Array<any>';
  }

  return 'any';
};

const stringifyHarmonyToolsSection = (rawTools: unknown): string => {
  if (!rawTools || typeof rawTools !== 'object') {
    return '';
  }

  const toolSections: string[] = ['# Tools'];
  const toolNamespaces = Object.values(
    rawTools as Record<string, Record<string, unknown>>
  );

  for (const nsConfig of toolNamespaces) {
    if (!nsConfig || typeof nsConfig !== 'object') {
      continue;
    }

    const name = String(nsConfig.name ?? '');
    if (name.length === 0) {
      continue;
    }

    const tools = Array.isArray(nsConfig.tools) ? nsConfig.tools : [];
    const toolSectionContent: string[] = [`## ${name}\n`];

    const description = nsConfig.description;
    if (typeof description === 'string' && description.length > 0) {
      for (const line of description.split('\n')) {
        toolSectionContent.push(tools.length > 0 ? `// ${line}` : line);
      }
    }

    if (tools.length > 0) {
      toolSectionContent.push(`namespace ${name} {\n`);
      for (const tool of tools) {
        if (!tool || typeof tool !== 'object') {
          continue;
        }

        const toolObject = tool as Record<string, unknown>;
        const toolName = String(toolObject.name ?? '');
        if (toolName.length === 0) {
          continue;
        }

        const toolDescription =
          typeof toolObject.description === 'string'
            ? toolObject.description
            : '';
        for (const line of toolDescription.split('\n')) {
          if (line.length > 0) {
            toolSectionContent.push(`// ${line}`);
          }
        }

        if (
          toolObject.parameters !== undefined &&
          toolObject.parameters !== null
        ) {
          toolSectionContent.push(
            `type ${toolName} = (_: ${jsonSchemaToTypeScript(toolObject.parameters, '')}) => any;\n`
          );
        } else {
          toolSectionContent.push(`type ${toolName} = () => any;\n`);
        }
      }
      toolSectionContent.push(`} // namespace ${name}`);
    }

    toolSections.push(toolSectionContent.join('\n'));
  }

  return toolSections.length > 1 ? toolSections.join('\n\n') : '';
};

const stringifyHarmonySystemContent = (
  content: Record<string, unknown>,
  conversationHasFunctionTools: boolean
): string => {
  const sections: string[] = [];
  const topSection: string[] = [];

  const modelIdentity = content.model_identity;
  if (typeof modelIdentity === 'string' && modelIdentity.length > 0) {
    topSection.push(modelIdentity);
  }

  const knowledgeCutoff = content.knowledge_cutoff;
  if (typeof knowledgeCutoff === 'string' && knowledgeCutoff.length > 0) {
    topSection.push(`Knowledge cutoff: ${knowledgeCutoff}`);
  }

  const conversationStartDate = content.conversation_start_date;
  if (
    typeof conversationStartDate === 'string' &&
    conversationStartDate.length > 0
  ) {
    topSection.push(`Current date: ${conversationStartDate}`);
  }

  if (topSection.length > 0) {
    sections.push(topSection.join('\n'));
  }

  const reasoningEffort = content.reasoning_effort;
  if (typeof reasoningEffort === 'string' && reasoningEffort.length > 0) {
    sections.push(`Reasoning: ${reasoningEffort.toLowerCase()}`);
  }

  const toolsSection = stringifyHarmonyToolsSection(content.tools);
  if (toolsSection.length > 0) {
    sections.push(toolsSection);
  }

  const channelConfig = content.channel_config as
    | {
        valid_channels?: string[];
        channel_required?: boolean;
      }
    | undefined;
  if (
    channelConfig &&
    Array.isArray(channelConfig.valid_channels) &&
    channelConfig.valid_channels.length > 0
  ) {
    const validChannels = channelConfig.valid_channels.join(', ');
    let channelsHeader = `# Valid channels: ${validChannels}.`;
    if (channelConfig.channel_required) {
      channelsHeader += ' Channel must be included for every message.';
    }
    if (conversationHasFunctionTools) {
      channelsHeader +=
        "\nCalls to these tools must go to the commentary channel: 'functions'.";
    }
    sections.push(channelsHeader);
  }

  return sections.join('\n\n');
};

const stringifyHarmonyDeveloperContent = (
  content: Record<string, unknown>
): string => {
  const sections: string[] = [];
  const instructions = content.instructions;
  if (typeof instructions === 'string' && instructions.length > 0) {
    sections.push('# Instructions');
    sections.push(instructions);
  }

  const toolsSection = stringifyHarmonyToolsSection(content.tools);
  if (toolsSection.length > 0) {
    sections.push(toolsSection);
  }

  return sections.join('\n\n');
};

const getHarmonyContentText = (
  role: string,
  rawContent: unknown,
  conversationHasFunctionTools: boolean
): string => {
  if (rawContent === null || rawContent === undefined) {
    return '';
  }

  if (typeof rawContent === 'string') {
    return rawContent;
  }

  const rawItems = Array.isArray(rawContent)
    ? rawContent
    : typeof rawContent === 'object' &&
        'parts' in (rawContent as Record<string, unknown>) &&
        Array.isArray((rawContent as { parts?: unknown[] }).parts)
      ? ((rawContent as { parts: unknown[] }).parts ?? [])
      : [rawContent];

  const renderedParts = rawItems.map(item => {
    if (item === null || item === undefined) {
      return '';
    }
    if (typeof item === 'string') {
      return item;
    }
    if (typeof item !== 'object') {
      return String(item);
    }

    const contentItem = item as Record<string, unknown>;
    const contentType =
      typeof contentItem.content_type === 'string'
        ? contentItem.content_type
        : typeof contentItem.type === 'string'
          ? contentItem.type
          : null;

    if (contentType === 'text' || typeof contentItem.text === 'string') {
      return String(contentItem.text ?? '');
    }
    if (
      contentType === 'system' ||
      contentType === 'system_content' ||
      role === 'system' ||
      'model_identity' in contentItem
    ) {
      return stringifyHarmonySystemContent(
        contentItem,
        conversationHasFunctionTools
      );
    }
    if (
      contentType === 'developer' ||
      contentType === 'developer_content' ||
      role === 'developer' ||
      'instructions' in contentItem
    ) {
      return stringifyHarmonyDeveloperContent(contentItem);
    }
    return JSON.stringify(contentItem);
  });

  return renderedParts.join('');
};

const conversationHasFunctionTools = (
  messages: Array<Record<string, unknown>>
): boolean => {
  return messages.some(message => {
    const author = (message.author ?? {}) as Record<string, unknown>;
    const role =
      (typeof message.role === 'string' ? message.role : null) ??
      (typeof author.role === 'string' ? author.role : null);
    if (role !== 'developer') {
      return false;
    }

    const rawContent = message.content;
    const rawItems = Array.isArray(rawContent) ? rawContent : [rawContent];
    return rawItems.some(item => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const tools = (item as Record<string, unknown>).tools;
      if (!tools || typeof tools !== 'object') {
        return false;
      }
      const functionsNamespace = (tools as Record<string, unknown>)
        .functions as Record<string, unknown> | undefined;
      return Array.isArray(functionsNamespace?.tools)
        ? functionsNamespace.tools.length > 0
        : false;
    });
  });
};

const encodeHarmonySpecialToken = (token: string): number[] => {
  const encoded = encodeHarmony(token, HARMONY_RENDER_SPECIAL_TOKEN_OPTIONS);
  if (encoded.length !== 1) {
    throw new Error(
      `Expected one special token for ${JSON.stringify(token)}, got ${JSON.stringify(encoded)}.`
    );
  }
  return encoded;
};

const encodeHarmonyText = (text: string): number[] =>
  text.length > 0 ? encodeHarmony(text) : [];

const renderHarmonyMessages = (
  conversationJSON: string
): {
  displayString: string;
  tokens: number[];
} => {
  const parsedConversation = JSON.parse(conversationJSON) as {
    messages?: Array<Record<string, unknown>>;
  };
  const messages = parsedConversation.messages ?? [];
  const hasFunctionTools = conversationHasFunctionTools(messages);
  const displayParts: string[] = [];
  const tokens: number[] = [];

  for (const message of messages) {
    const author = (message.author ?? {}) as Record<string, unknown>;
    const role =
      (typeof message.role === 'string' ? message.role : null) ??
      (typeof author.role === 'string' ? author.role : null);
    if (!role) {
      throw new Error(`Message is missing role: ${JSON.stringify(message)}`);
    }

    const name =
      (typeof message.name === 'string' ? message.name : null) ??
      (typeof author.name === 'string' ? author.name : null);
    const authorText =
      role === 'tool'
        ? name
          ? name
          : (() => {
              throw new Error(
                `Tools should have a name: ${JSON.stringify(message)}`
              );
            })()
        : `${role}${name ? `:${name}` : ''}`;
    const recipient =
      typeof message.recipient === 'string' &&
      message.recipient.length > 0 &&
      message.recipient !== 'all'
        ? ` to=${message.recipient}`
        : '';
    const channel =
      typeof message.channel === 'string' && message.channel.length > 0
        ? message.channel
        : '';
    const contentType =
      typeof message.content_type === 'string' &&
      message.content_type.length > 0
        ? message.content_type
        : '';
    const contentText = getHarmonyContentText(
      role,
      message.content,
      hasFunctionTools
    );
    const endToken =
      role === 'assistant' && typeof message.recipient === 'string'
        ? HARMONY_CALL_TOKEN
        : HARMONY_END_TOKEN;

    displayParts.push(HARMONY_START_TOKEN);
    displayParts.push(authorText);
    displayParts.push(recipient);
    if (channel.length > 0) {
      displayParts.push(HARMONY_CHANNEL_TOKEN);
      displayParts.push(channel);
    }
    if (contentType.length > 0) {
      displayParts.push(' ');
      displayParts.push(contentType);
    }
    displayParts.push(HARMONY_MESSAGE_TOKEN);
    displayParts.push(contentText);
    displayParts.push(endToken);

    // Encode structural Harmony markers one at a time. gpt-tokenizer's raw
    // string scanner currently misses later special tokens in a mixed string.
    tokens.push(...encodeHarmonySpecialToken(HARMONY_START_TOKEN));
    tokens.push(...encodeHarmonyText(authorText));
    tokens.push(...encodeHarmonyText(recipient));
    if (channel.length > 0) {
      tokens.push(...encodeHarmonySpecialToken(HARMONY_CHANNEL_TOKEN));
      tokens.push(...encodeHarmonyText(channel));
    }
    if (contentType.length > 0) {
      tokens.push(...encodeHarmonyText(' '));
      if (contentType.startsWith(HARMONY_CONSTRAIN_MARKER)) {
        tokens.push(...encodeHarmonySpecialToken(HARMONY_CONSTRAIN_MARKER));
        tokens.push(
          ...encodeHarmonyText(
            contentType.slice(HARMONY_CONSTRAIN_MARKER.length)
          )
        );
      } else {
        tokens.push(...encodeHarmonyText(contentType));
      }
    }
    tokens.push(...encodeHarmonySpecialToken(HARMONY_MESSAGE_TOKEN));
    tokens.push(...encodeHarmonyText(contentText));
    tokens.push(...encodeHarmonySpecialToken(endToken));
  }

  return {
    displayString: displayParts.join(''),
    tokens
  };
};

export const renderHarmonyConversationForDisplay = (
  conversationJSON: string
): string => {
  return renderHarmonyMessages(conversationJSON).displayString;
};

export const renderHarmonyConversationInBrowser = (
  conversation: string,
  renderer: string
): HarmonyRenderResponse => {
  if (renderer !== HARMONY_RENDERER_NAME) {
    throw new Error(
      `Unsupported renderer: ${renderer}. Expected ${HARMONY_RENDERER_NAME}.`
    );
  }

  const { displayString, tokens } = renderHarmonyMessages(conversation);
  const decodedTokens = tokens.map(token => decodeHarmony([token]));
  return {
    tokens,
    decoded_tokens: decodedTokens,
    display_string: displayString,
    partial_success_error_messages: []
  };
};
