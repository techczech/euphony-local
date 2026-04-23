import type { Conversation } from '../../types/harmony-types';
import { isCodexSessionJSONL } from '../../utils/codex-session';

type ParsedItem = Record<string, unknown> | string | Conversation;

export type LocalDataWorkerMessage =
  | {
      command: 'startParseData';
      payload: {
        requestID: number;
        sourceName: 'clipboard' | 'file';
        sourceText?: string;
        sourceFile?: File;
      };
    }
  | {
      command: 'finishParseData';
      payload:
        | {
            requestID: number;
            sourceName: 'clipboard' | 'file';
            dataType: 'codex';
            codexSessionData: unknown[];
          }
        | {
            requestID: number;
            sourceName: 'clipboard' | 'file';
            dataType: 'conversation';
            conversationData: Conversation[];
          }
        | {
            requestID: number;
            sourceName: 'clipboard' | 'file';
            dataType: 'json';
            jsonData: Record<string, unknown>[];
          };
    }
  | {
      command: 'error';
      payload: {
        requestID: number;
        sourceName: 'clipboard' | 'file';
        message: string;
      };
    };

const isConversation = (data: unknown) => {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return 'messages' in data && Array.isArray(data.messages);
};

const extractConversationFromJSONL = (
  data: unknown[]
): Conversation[] | null => {
  let curData: Record<string, Conversation | string>[] | null = null;

  if (
    data.length > 0 &&
    typeof data[0] === 'object' &&
    !isConversation(data[0])
  ) {
    curData = data as Record<string, Conversation | string>[];
  }

  if (data.length > 0 && typeof data[0] === 'string') {
    let shouldSkipTransformation = false;
    try {
      const conversation = JSON.parse(data[0]) as Conversation;
      if (isConversation(conversation)) {
        shouldSkipTransformation = true;
      }
    } catch (_error) {
      shouldSkipTransformation = true;
    }

    if (!shouldSkipTransformation) {
      curData = [];
      for (const d of data) {
        const record = JSON.parse(d as string) as Record<
          string,
          Conversation | string
        >;
        curData.push(record);
      }
    }
  }

  if (curData !== null) {
    let conversationKey: string | null = null;
    let conversationFieldIsString = false;

    for (const key in curData[0]) {
      if (typeof curData[0][key] === 'string') {
        try {
          const conversation = JSON.parse(curData[0][key]) as Conversation;
          if (isConversation(conversation)) {
            conversationKey = key;
            conversationFieldIsString = true;
            break;
          }
        } catch (_error) {
          continue;
        }
      } else if (isConversation(curData[0][key])) {
        conversationKey = key;
        break;
      }
    }

    if (conversationKey !== null) {
      const conversationData: Conversation[] = [];

      for (const d of curData) {
        const conversation = conversationFieldIsString
          ? (JSON.parse(d[conversationKey] as string) as Conversation)
          : (d[conversationKey] as Conversation);
        conversation.metadata ??= {};

        for (const k in d) {
          if (k !== conversationKey) {
            conversation.metadata[`euphonyTransformed-${k}`] = d[k];
          }
        }

        conversationData.push(conversation);
      }
      return conversationData;
    }
  }

  return null;
};

const validateAndTransformConversations = (
  conversations: ParsedItem[]
): conversations is Conversation[] => {
  const allValid: boolean[] = [];

  for (const [i, conversation] of conversations.entries()) {
    if (typeof conversation === 'string') {
      const conversationData = JSON.parse(conversation) as Record<
        string,
        unknown
      >;
      let newItem = conversation;

      if (
        conversationData.conversation_id !== undefined &&
        conversationData.id === undefined
      ) {
        conversationData.id = conversationData.conversation_id;
        newItem = JSON.stringify(conversationData);
      }

      conversations[i] = newItem;
      allValid.push(Array.isArray(conversationData.messages));
    } else {
      const conversationData = conversation as Record<string, unknown>;

      if (
        conversationData.conversation_id !== undefined &&
        conversationData.id === undefined
      ) {
        conversationData.id = conversationData.conversation_id;
      }

      conversations[i] = conversationData;
      allValid.push(Array.isArray(conversationData.messages));
    }
  }

  return allValid.every(Boolean);
};

const parseSourceText = (sourceText: string): ParsedItem[] => {
  const allData: ParsedItem[] = [];

  try {
    const jsonData = JSON.parse(sourceText) as Record<string, unknown>;
    allData.push(jsonData);
    return allData;
  } catch (_error) {
    for (const line of sourceText.split('\n')) {
      try {
        allData.push(JSON.parse(line) as Record<string, unknown> | string);
      } catch (_innerError) {
        // Skip invalid JSONL lines.
      }
    }
  }

  return allData;
};

const parseLocalData = (
  sourceText: string
):
  | { dataType: 'codex'; codexSessionData: unknown[] }
  | { dataType: 'conversation'; conversationData: Conversation[] }
  | { dataType: 'json'; jsonData: Record<string, unknown>[] } => {
  let allData = parseSourceText(sourceText);

  if (allData.length === 0) {
    throw new Error('Failed to read any JSON or JSONL data.');
  }

  if (isCodexSessionJSONL(allData as unknown[])) {
    return {
      dataType: 'codex',
      codexSessionData: allData as unknown[]
    };
  }

  const transformedConversationData = extractConversationFromJSONL(
    allData as unknown[]
  );
  if (transformedConversationData) {
    allData = transformedConversationData;
  }

  if (!validateAndTransformConversations(allData)) {
    return {
      dataType: 'json',
      jsonData: allData as Record<string, unknown>[]
    };
  }

  const conversationData: Conversation[] = [];
  for (const item of allData) {
    if (typeof item === 'string') {
      conversationData.push(JSON.parse(item) as Conversation);
    } else {
      conversationData.push(item);
    }
  }

  return {
    dataType: 'conversation',
    conversationData
  };
};

self.onmessage = async (e: MessageEvent<LocalDataWorkerMessage>) => {
  if (e.data.command !== 'startParseData') {
    console.error('Worker: unknown message', e.data.command);
    return;
  }

  const { requestID, sourceName, sourceText, sourceFile } = e.data.payload;

  try {
    const text = sourceText ?? (await sourceFile?.text());
    if (text === undefined) {
      throw new Error('No source text or file was provided.');
    }
    const result = parseLocalData(text);
    const message: LocalDataWorkerMessage = {
      command: 'finishParseData',
      payload: {
        requestID,
        sourceName,
        ...result
      }
    };
    postMessage(message);
  } catch (error) {
    const message: LocalDataWorkerMessage = {
      command: 'error',
      payload: {
        requestID,
        sourceName,
        message: error instanceof Error ? error.message : String(error)
      }
    };
    postMessage(message);
  }
};
