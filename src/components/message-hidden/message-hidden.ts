import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { tryGetContentTypeFromContent } from '../../types/harmony-types';
import type { Message } from '../../types/harmony-types';
import componentCSS from './message-hidden.css?inline';

/**
 * Compact placeholder shown when a message is hidden by focus mode filters.
 * Clicking it emits an event that the parent conversation uses to unhide the
 * specific message instance.
 */
@customElement('euphony-message-hidden')
export class EuphonyMessageHidden extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  /**
   * The original message object. We only use it to derive a human-readable
   * content type label (e.g. "text", "developer") for the placeholder text.
   */
  @property({ attribute: false })
  message: Message | null = null;

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();
  }

  /**
   * This method is called when the DOM is added for the first time.
   * Present for consistency with other message components.
   */
  firstUpdated() {}

  /**
   * This method is called before new DOM is updated and rendered.
   * Present for consistency with other message components.
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {}

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  /**
   * Placeholder to match the common component interface used across message
   * components in this codebase.
   */
  async initData() {}

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    let messageContentType = '';
    if (this.message) {
      // Normalize the derived content type into a readable label.
      // Example: "developer" remains "developer", while any future snake_case
      // values will be rendered as space-separated lowercase text.
      messageContentType = (
        tryGetContentTypeFromContent(this.message.content) ?? 'unsupported'
      )
        .replaceAll('_', ' ')
        .toLowerCase();
    }

    return html`
      <div
        class="message-content"
        @click=${() => {
          // The parent conversation listens for this to exempt this message
          // from focus-mode hiding.
          this.dispatchEvent(
            new Event('hidden-message-clicked', {
              bubbles: true,
              composed: true
            })
          );
        }}
      >
        <div class="message-text">Show ${messageContentType} message</div>
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
    'euphony-message-hidden': EuphonyMessageHidden;
  }
}
