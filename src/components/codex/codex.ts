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
  selectedCategories: string[] = [];

  @state()
  availableEventTypes: string[] = [];

  @state()
  availablePayloadTypes: string[] = [];

  @state()
  selectedEventTypes: string[] = [];

  @state()
  selectedPayloadTypes: string[] = [];

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
    this.availableEventTypes = this.getAvailableEventTypes(parseResult.conversation);
    this.availablePayloadTypes = this.getAvailablePayloadTypes(
      parseResult.conversation
    );
    this.selectedCategories = [];
    this.selectedEventTypes = [];
    this.selectedPayloadTypes = [];
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

  private getCategoryLabel(category: string) {
    switch (category) {
      case 'user':
        return 'User';
      case 'assistant':
        return 'Assistant';
      case 'reasoning':
        return 'Reasoning';
      case 'tool-call':
        return 'Tool calls';
      case 'tool-output':
        return 'Tool outputs';
      case 'instructions':
        return 'Instructions';
      case 'system':
        return 'System';
      default:
        return category;
    }
  }

  private getSelectedSummary(selectedValues: string[], fallbackLabel: string) {
    if (selectedValues.length === 0) {
      return fallbackLabel;
    }

    return `Showing ${selectedValues.join(', ')}`;
  }

  private toggleSelectedValue(
    currentValues: string[],
    value: string,
    setValues: (values: string[]) => void
  ) {
    setValues(
      currentValues.includes(value)
        ? currentValues.filter(currentValue => currentValue !== value)
        : [...currentValues, value]
    );
    this.applySessionFilters();
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
    if (
      this.selectedCategories.length > 0 &&
      !this.selectedCategories.includes(category)
    ) {
      return false;
    }

    const eventType = this.getMessageMetadataValue(message, 'codex_event_type');
    if (
      this.selectedEventTypes.length > 0 &&
      (!eventType || !this.selectedEventTypes.includes(eventType))
    ) {
      return false;
    }

    const payloadType = this.getMessageMetadataValue(message, 'codex_payload_type');
    if (
      this.selectedPayloadTypes.length > 0 &&
      (!payloadType || !this.selectedPayloadTypes.includes(payloadType))
    ) {
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

  private toggleCategory(category: string) {
    this.toggleSelectedValue(this.selectedCategories, category, values => {
      this.selectedCategories = values;
    });
  }

  private async jumpToFirstVisibleMessage() {
    await this.updateComplete;
    await this.conversationComponent?.updateComplete;
    const firstUserIndex =
      this.conversation?.messages.findIndex(
        message => this.getMessageCategory(message) === 'user'
      ) ?? -1;
    const targetIndex = firstUserIndex >= 0 ? firstUserIndex : 0;
    const target =
      this.conversationComponent?.getMessageByIndex(targetIndex) ??
      this.conversationComponent?.shadowRoot?.querySelector('.message');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private toggleEventType(eventType: string) {
    this.toggleSelectedValue(this.selectedEventTypes, eventType, values => {
      this.selectedEventTypes = values;
    });
  }

  private togglePayloadType(payloadType: string) {
    this.toggleSelectedValue(this.selectedPayloadTypes, payloadType, values => {
      this.selectedPayloadTypes = values;
    });
  }

  private resetSessionFilters() {
    if (!this.baseConversation) {
      return;
    }

    this.sessionMessageSearch = '';
    this.selectedCategories = [];
    this.selectedEventTypes = [];
    this.selectedPayloadTypes = [];
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
          <div class="session-toolbar-hint">
            Select pills to focus the view. With no pills selected, the session
            shows everything.
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
              ?is-active=${this.selectedCategories.includes('user')}
              @click=${() => {
                this.toggleCategory('user');
              }}
            >
              User
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('assistant')}
              @click=${() => {
                this.toggleCategory('assistant');
              }}
            >
              Assistant
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('reasoning')}
              @click=${() => {
                this.toggleCategory('reasoning');
              }}
            >
              Reasoning
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('tool-call')}
              @click=${() => {
                this.toggleCategory('tool-call');
              }}
            >
              Tool calls
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('tool-output')}
              @click=${() => {
                this.toggleCategory('tool-output');
              }}
            >
              Tool outputs
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('instructions')}
              @click=${() => {
                this.toggleCategory('instructions');
              }}
            >
              Instructions
            </button>
            <button
              class="session-toolbar-button"
              ?is-active=${this.selectedCategories.includes('system')}
              @click=${() => {
                this.toggleCategory('system');
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
          <div class="session-toolbar-summary">
            ${this.getSelectedSummary(
              this.selectedCategories.map(category =>
                this.getCategoryLabel(category)
              ),
              'Showing all categories'
            )}
          </div>
          ${this.availableEventTypes.length > 0
            ? html`
                <div class="session-toolbar-subsection">
                  <div class="session-toolbar-subtitle">Event types</div>
                  <div class="session-toolbar-summary">
                    ${this.getSelectedSummary(
                      this.selectedEventTypes,
                      'Showing all event types'
                    )}
                  </div>
                  <div class="session-toolbar-controls">
                    ${this.availableEventTypes.map(
                      eventType => html`
                        <button
                          class="session-toolbar-button"
                          ?is-active=${this.selectedEventTypes.includes(eventType)}
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
          ${this.availablePayloadTypes.length > 0
            ? html`
                <div class="session-toolbar-subsection">
                  <div class="session-toolbar-subtitle">Response or payload types</div>
                  <div class="session-toolbar-summary">
                    ${this.getSelectedSummary(
                      this.selectedPayloadTypes,
                      'Showing all payload types'
                    )}
                  </div>
                  <div class="session-toolbar-controls">
                    ${this.availablePayloadTypes.map(
                      payloadType => html`
                        <button
                          class="session-toolbar-button"
                          ?is-active=${this.selectedPayloadTypes.includes(
                            payloadType
                          )}
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
