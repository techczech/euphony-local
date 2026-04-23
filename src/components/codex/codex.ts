import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { Conversation, Message } from '../../types/harmony-types';
import { Role } from '../../types/harmony-types';
import { parseCodexSession } from '../../utils/codex-session';
import type { EuphonyConversation } from '../conversation/conversation';
import type {
  FocusModeSettings,
  MessageLabelSettings
} from '../preference-window/preference-window';

import '../conversation/conversation';
import componentCSS from './codex.css?inline';

@customElement('euphony-codex')
export class EuphonyCodex extends LitElement {
  @property({ type: String, attribute: 'session-string' })
  sessionString = '';

  @property({ attribute: false })
  sessionData: unknown[] | null = null;

  @property({ type: String, attribute: 'sharing-url' })
  sharingURL: string | null = null;

  @property({ type: String, attribute: 'conversation-label' })
  conversationLabel = 'Session';

  @property({ type: String, attribute: 'conversation-max-width' })
  conversationMaxWidth: string | null = null;

  @property({ type: String, attribute: 'conversation-style' })
  conversationStyle = '';

  @property({ type: Boolean, attribute: 'should-render-markdown' })
  shouldRenderMarkdown = false;

  @property({ type: Boolean, attribute: 'is-showing-metadata' })
  isShowingMetadata = false;

  @property({ type: Array, attribute: 'focus-mode-author' })
  focusModeAuthor: string[] = [];

  @property({ type: Array, attribute: 'focus-mode-recipient' })
  focusModeRecipient: string[] = [];

  @property({ type: Array, attribute: 'focus-mode-content-type' })
  focusModeContentType: string[] = [];

  @property({ type: Boolean, attribute: 'disable-markdown-button' })
  disableMarkdownButton = false;

  @property({ type: Boolean, attribute: 'disable-translation-button' })
  disableTranslationButton = false;

  @property({ type: Boolean, attribute: 'disable-share-button' })
  disableShareButton = false;

  @property({ type: Boolean, attribute: 'disable-metadata-button' })
  disableMetadataButton = false;

  @property({ type: Boolean, attribute: 'disable-message-metadata' })
  disableMessageMetadata = false;

  @property({ type: Boolean, attribute: 'disable-conversation-name' })
  disableConversationName = false;

  @property({ type: Boolean, attribute: 'disable-preference-button' })
  disablePreferenceButton = false;

  @property({ type: Boolean, attribute: 'disable-image-preview-window' })
  disableImagePreviewWindow = false;

  @property({ type: Boolean, attribute: 'disable-token-window' })
  disableTokenWindow = false;

  @property({ type: Boolean, attribute: 'disable-editing-mode-save-button' })
  disableEditingModeSaveButton = false;

  @property({ type: Boolean, attribute: 'disable-conversation-id-copy-button' })
  disableConversationIDCopyButton = false;

  @property({
    type: String,
    attribute: 'disable-download-convo-button-tooltip'
  })
  disableDownloadConvoButtonTooltip = '';

  @property({ type: String, attribute: 'disable-copy-convo-button-tooltip' })
  disableCopyConvoButtonTooltip = '';

  @property({ type: String, attribute: 'theme' })
  theme: 'auto' | 'light' | 'dark' = 'light';

  @state()
  baseConversation: Conversation | null = null;

  @state()
  conversation: Conversation | null = null;

  @state()
  parseError: string | null = null;

  @state()
  sessionMessageSearch = '';

  @state()
  showUserMessages = true;

  @state()
  showAssistantMessages = true;

  @state()
  showReasoningMessages = true;

  @state()
  showToolCalls = true;

  @state()
  showToolOutputs = true;

  @state()
  showInstructionMessages = true;

  @state()
  showSystemMessages = true;

  @state()
  enabledEventTypes: string[] = [];

  @state()
  enabledPayloadTypes: string[] = [];

  @query('euphony-conversation')
  conversationComponent: EuphonyConversation | undefined;

  private getMessageMetadataValue(message: Message, key: string): string | null {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  private parseSessionString(sessionString: string): unknown[] {
    const lines = sessionString
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');

    const events: unknown[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as unknown);
      } catch (_error) {
        // Ignore malformed lines so one bad row does not drop the whole session.
      }
    }
    return events;
  }

  private refreshConversationFromSession() {
    const hasSessionData =
      Array.isArray(this.sessionData) && this.sessionData.length > 0;
    const rawEvents = hasSessionData
      ? (this.sessionData ?? [])
      : this.sessionString !== ''
        ? this.parseSessionString(this.sessionString)
        : [];

    const parseResult = parseCodexSession(rawEvents);
    if (!parseResult) {
      this.baseConversation = null;
      this.conversation = null;
      this.parseError =
        rawEvents.length === 0
          ? 'No Codex session data found.'
          : 'Unsupported or malformed Codex session JSONL.';
      return;
    }

    this.baseConversation = parseResult.conversation;
    this.enabledEventTypes = this.getAvailableEventTypes(parseResult.conversation);
    this.enabledPayloadTypes = this.getAvailablePayloadTypes(parseResult.conversation);
    this.applySessionFilters();
    this.parseError = null;
  }

  private getAvailableEventTypes(conversation: Conversation) {
    return Array.from(
      new Set(
        conversation.messages
          .map(message => this.getMessageMetadataValue(message, 'codex_event_type'))
          .filter((value): value is string => value !== null)
      )
    );
  }

  private getAvailablePayloadTypes(conversation: Conversation) {
    return Array.from(
      new Set(
        conversation.messages
          .map(message =>
            this.getMessageMetadataValue(message, 'codex_payload_type')
          )
          .filter((value): value is string => value !== null)
      )
    );
  }

  private getMessageCategory(message: Message) {
    if (message.role === Role.Developer) {
      return 'instructions';
    }

    if (message.role === Role.Tool) {
      if (message.channel === 'output') {
        return 'tool-output';
      }
      return 'tool-call';
    }

    if (message.role === Role.Assistant && message.channel === 'analysis') {
      return 'reasoning';
    }

    if (message.role === Role.User) {
      return 'user';
    }

    if (message.role === Role.Assistant) {
      return 'assistant';
    }

    return 'system';
  }

  private getMessageSearchText(message: Message): string {
    const textParts: string[] = [];
    if (typeof message.name === 'string') {
      textParts.push(message.name);
    }
    if (typeof message.recipient === 'string') {
      textParts.push(message.recipient);
    }
    if (typeof message.channel === 'string') {
      textParts.push(message.channel);
    }

    for (const part of message.content) {
      if (typeof part === 'string') {
        textParts.push(part);
        continue;
      }
      if (part && typeof part === 'object') {
        if ('text' in part && typeof part.text === 'string') {
          textParts.push(part.text);
        }
        if ('instructions' in part && typeof part.instructions === 'string') {
          textParts.push(part.instructions);
        }
      }
    }

    return textParts.join('\n').toLowerCase();
  }

  private shouldShowMessage(message: Message) {
    const category = this.getMessageCategory(message);
    if (category === 'user' && !this.showUserMessages) {
      return false;
    }
    if (category === 'assistant' && !this.showAssistantMessages) {
      return false;
    }
    if (category === 'reasoning' && !this.showReasoningMessages) {
      return false;
    }
    if (category === 'tool-call' && !this.showToolCalls) {
      return false;
    }
    if (category === 'tool-output' && !this.showToolOutputs) {
      return false;
    }
    if (category === 'instructions' && !this.showInstructionMessages) {
      return false;
    }
    if (category === 'system' && !this.showSystemMessages) {
      return false;
    }

    const eventType = this.getMessageMetadataValue(message, 'codex_event_type');
    if (eventType && !this.enabledEventTypes.includes(eventType)) {
      return false;
    }

    const payloadType = this.getMessageMetadataValue(message, 'codex_payload_type');
    if (payloadType && !this.enabledPayloadTypes.includes(payloadType)) {
      return false;
    }

    const query = this.sessionMessageSearch.trim().toLowerCase();
    if (query !== '' && !this.getMessageSearchText(message).includes(query)) {
      return false;
    }

    return true;
  }

  private applySessionFilters() {
    if (!this.baseConversation) {
      this.conversation = null;
      return;
    }

    this.conversation = {
      ...this.baseConversation,
      messages: this.baseConversation.messages.filter(message =>
        this.shouldShowMessage(message)
      )
    };
  }

  private toggleSessionVisibility(
    key:
      | 'showUserMessages'
      | 'showAssistantMessages'
      | 'showReasoningMessages'
      | 'showToolCalls'
      | 'showToolOutputs'
      | 'showInstructionMessages'
      | 'showSystemMessages'
  ) {
    this[key] = !this[key];
    this.applySessionFilters();
  }

  private async jumpToFirstVisibleMessage() {
    await this.updateComplete;
    await this.conversationComponent?.updateComplete;
    const target =
      this.conversationComponent?.getMessageByIndex(0) ??
      this.conversationComponent?.shadowRoot?.querySelector('.message');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private toggleEventType(eventType: string) {
    this.enabledEventTypes = this.enabledEventTypes.includes(eventType)
      ? this.enabledEventTypes.filter(value => value !== eventType)
      : [...this.enabledEventTypes, eventType];
    this.applySessionFilters();
  }

  private togglePayloadType(payloadType: string) {
    this.enabledPayloadTypes = this.enabledPayloadTypes.includes(payloadType)
      ? this.enabledPayloadTypes.filter(value => value !== payloadType)
      : [...this.enabledPayloadTypes, payloadType];
    this.applySessionFilters();
  }

  private resetSessionFilters() {
    if (!this.baseConversation) {
      return;
    }

    this.sessionMessageSearch = '';
    this.showUserMessages = true;
    this.showAssistantMessages = true;
    this.showReasoningMessages = true;
    this.showToolCalls = true;
    this.showToolOutputs = true;
    this.showInstructionMessages = true;
    this.showSystemMessages = true;
    this.enabledEventTypes = this.getAvailableEventTypes(this.baseConversation);
    this.enabledPayloadTypes = this.getAvailablePayloadTypes(this.baseConversation);
    this.applySessionFilters();
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('sessionString') ||
      changedProperties.has('sessionData')
    ) {
      this.refreshConversationFromSession();
    }
  }

  render() {
    if (!this.conversation) {
      return html`
        <div class="empty-state">
          ${this.parseError ?? 'No Codex session to display.'}
        </div>
      `;
    }

    return html`
      <div class="codex-wrapper">
        <div class="session-toolbar">
          <div class="session-toolbar-header">
            <div class="session-toolbar-title">Session filters</div>
            <div class="session-toolbar-count">
              ${this.conversation.messages.length} visible
              ${this.baseConversation
                ? html`/ ${this.baseConversation.messages.length} total`
                : html``}
            </div>
          </div>
          <div class="session-toolbar-controls">
            <sl-input
              size="small"
              placeholder="Filter this session"
              .value=${this.sessionMessageSearch}
              @sl-input=${(e: Event) => {
                const target = e.target as HTMLInputElement;
                this.sessionMessageSearch = target.value;
                this.applySessionFilters();
              }}
            ></sl-input>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showUserMessages}
              @click=${() => {
                this.toggleSessionVisibility('showUserMessages');
              }}
            >
              User
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showAssistantMessages}
              @click=${() => {
                this.toggleSessionVisibility('showAssistantMessages');
              }}
            >
              Assistant
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showReasoningMessages}
              @click=${() => {
                this.toggleSessionVisibility('showReasoningMessages');
              }}
            >
              Reasoning
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showToolCalls}
              @click=${() => {
                this.toggleSessionVisibility('showToolCalls');
              }}
            >
              Tool calls
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showToolOutputs}
              @click=${() => {
                this.toggleSessionVisibility('showToolOutputs');
              }}
            >
              Tool outputs
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showInstructionMessages}
              @click=${() => {
                this.toggleSessionVisibility('showInstructionMessages');
              }}
            >
              Instructions
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.showSystemMessages}
              @click=${() => {
                this.toggleSessionVisibility('showSystemMessages');
              }}
            >
              System
            </button>
            <button
              class="session-toolbar-button session-toolbar-button-secondary"
              @click=${() => {
                this.jumpToFirstVisibleMessage().then(
                  () => {},
                  () => {}
                );
              }}
            >
              Jump to first
            </button>
            <button
              class="session-toolbar-button"
              @click=${() => {
                this.resetSessionFilters();
              }}
            >
              Reset
            </button>
          </div>
          ${this.enabledEventTypes.length > 0
            ? html`
                <div class="session-toolbar-subsection">
                  <div class="session-toolbar-subtitle">Event types</div>
                  <div class="session-toolbar-controls">
                    ${this.getAvailableEventTypes(this.baseConversation!).map(
                      eventType => html`
                        <button
                          class="session-toolbar-button"
                          ?is-active=${this.enabledEventTypes.includes(eventType)}
                          @click=${() => {
                            this.toggleEventType(eventType);
                          }}
                        >
                          ${eventType}
                        </button>
                      `
                    )}
                  </div>
                </div>
              `
            : html``}
          ${this.enabledPayloadTypes.length > 0
            ? html`
                <div class="session-toolbar-subsection">
                  <div class="session-toolbar-subtitle">Response or payload types</div>
                  <div class="session-toolbar-controls">
                    ${this.getAvailablePayloadTypes(this.baseConversation!).map(
                      payloadType => html`
                        <button
                          class="session-toolbar-button"
                          ?is-active=${this.enabledPayloadTypes.includes(payloadType)}
                          @click=${() => {
                            this.togglePayloadType(payloadType);
                          }}
                        >
                          ${payloadType}
                        </button>
                      `
                    )}
                  </div>
                </div>
              `
            : html``}
        </div>
        <euphony-conversation
          .conversationData=${this.conversation}
          sharing-url=${ifDefined(this.sharingURL ?? undefined)}
          conversation-label=${this.conversationLabel}
          conversation-max-width=${ifDefined(
            this.conversationMaxWidth ?? undefined
          )}
          ?should-render-markdown=${this.shouldRenderMarkdown}
          ?is-showing-metadata=${this.isShowingMetadata}
          .focusModeAuthor=${this.focusModeAuthor}
          .focusModeRecipient=${this.focusModeRecipient}
          .focusModeContentType=${this.focusModeContentType}
          ?disable-markdown-button=${this.disableMarkdownButton}
          ?disable-translation-button=${this.disableTranslationButton}
          ?disable-share-button=${this.disableShareButton}
          ?disable-metadata-button=${this.disableMetadataButton}
          ?disable-message-metadata=${this.disableMessageMetadata}
          ?disable-conversation-name=${this.disableConversationName}
          ?disable-preference-button=${this.disablePreferenceButton}
          ?disable-image-preview-window=${this.disableImagePreviewWindow}
          ?disable-token-window=${this.disableTokenWindow}
          ?disable-editing-mode-save-button=${this.disableEditingModeSaveButton}
          ?disable-conversation-id-copy-button=${this
            .disableConversationIDCopyButton}
          disable-download-convo-button-tooltip=${ifDefined(
            this.disableDownloadConvoButtonTooltip || undefined
          )}
          disable-copy-convo-button-tooltip=${ifDefined(
            this.disableCopyConvoButtonTooltip || undefined
          )}
          theme=${this.theme}
          style=${this.conversationStyle}
        ></euphony-conversation>
      </div>
    `;
  }

  static styles = [
    css`
      ${unsafeCSS(componentCSS)}
    `
  ];

  preferenceWindowMessageLabelChanged(e: CustomEvent<MessageLabelSettings>) {
    this.conversationComponent?.preferenceWindowMessageLabelChanged(e);
  }

  preferenceWindowFocusModeSettingsChanged(e: CustomEvent<FocusModeSettings>) {
    this.conversationComponent?.preferenceWindowFocusModeSettingsChanged(e);
  }

  expandBlockContents() {
    this.conversationComponent?.expandBlockContents();
  }

  collapseBlockContents() {
    this.conversationComponent?.collapseBlockContents();
  }

  translationButtonClicked() {
    void this.conversationComponent?.translationButtonClicked();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'euphony-codex': EuphonyCodex;
  }
}
