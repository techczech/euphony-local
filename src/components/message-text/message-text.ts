import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import {
  getContentFromContentOrString,
  getContentTypeFromContent
} from '../../types/harmony-types';
import { getMarkdownTemplate } from '../../utils/utils';

import type { Message, TextMessageContent } from '../../types/harmony-types';

import componentCSS from './message-text.css?inline';

/**
 * Message text element.
 */
@customElement('euphony-message-text')
export class EuphonyMessageText extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ attribute: false })
  message: Message | null = null;

  @property({ type: Boolean })
  shouldRenderMarkdown = false;

  @property({ type: Array })
  markdownAllowedTags: string[] | null = null;

  @property({ type: Array })
  markdownAllowedAttributes: string[] | null = null;

  @property({ type: Boolean })
  isTranslation = false;

  @property({ type: Boolean })
  isEditable = false;

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();
  }

  /**
   * This method is called when the DOM is added for the first time
   */
  firstUpdated() {}

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('message')) {
      // Validate the message is indeed a text message
      if (this.message) {
        const type = getContentTypeFromContent(this.message.content);
        if (type !== 'text') {
          throw new Error(
            `Invalid message type, expect text, but got: ${type}`
          );
        }
      }
    }
  }

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  messageTextChanged(e: InputEvent) {
    const element = e.target as HTMLElement;
    const newText = element.innerText;
    const event = new CustomEvent<string>('message-text-changed', {
      detail: newText,
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  /**
   * Generates an HTML template for an editable content.
   */
  getEditableTemplate = (content: string) => {
    return html` <!-- Important to avoid new line and whitespace here -->
      <!-- prettier-ignore -->
      <div
      class="message-text"
      contenteditable="true"
      .innerText=${content}
      @input=${(e: InputEvent) => {
        this.messageTextChanged(e);
      }}
    ></div>`;
  };

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    if (this.message === null) {
      return html``;
    }

    const content = getContentFromContentOrString(
      this.message.content
    ) as TextMessageContent;
    const messageTextString = content.text;

    // Render the message content as markdown if enabled
    let messageText = html``;
    if (this.isEditable) {
      messageText = this.getEditableTemplate(messageTextString);
    } else {
      messageText = getMarkdownTemplate(
        messageTextString,
        this.shouldRenderMarkdown,
        this.markdownAllowedTags,
        this.markdownAllowedAttributes
      );
    }

    return html`
      <div class="message-content" ?is-translation=${this.isTranslation}>
        ${messageText}
      </div>
    `;
  }

  static styles = [
    css`
      ${unsafeCSS(componentCSS)}
    `
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'euphony-message-text': EuphonyMessageText;
  }
}
