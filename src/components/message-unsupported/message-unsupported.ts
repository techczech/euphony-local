import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';

import type { Message } from '../../types/harmony-types';

import prismCSS from '../../css/prism-coldark-auto.css?inline';
import iconTriangle from '../../images/icon-play.svg?raw';
import componentCSS from './message-unsupported.css?inline';

@customElement('euphony-message-unsupported')
export class EuphonyMessageUnsupported extends LitElement {
  @property({ attribute: false })
  message: Message | null = null;

  @state()
  isCollapsed = true;

  firstUpdated() {}

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('message')) {
      this.isCollapsed = true;
    }
  }

  async initData() {}

  private getHighlightedCode(code: string, language: string) {
    if (!(language in Prism.languages)) {
      return html`${code}`;
    }

    const grammar = Prism.languages[language];
    const codeHTML = Prism.highlight(code, grammar, language);
    return html`${unsafeHTML(codeHTML)}`;
  }

  private getRawContentJSON() {
    if (!this.message) {
      return '';
    }

    try {
      return JSON.stringify(this.message.content, null, 2);
    } catch (_) {
      return String(this.message.content);
    }
  }

  private getContentTypeLabel() {
    if (!this.message) {
      return 'unknown';
    }

    const content = this.message.content as
      | { content_type?: string | null }
      | string
      | unknown[];

    if (typeof content === 'object' && content !== null && 'content_type' in content) {
      return content.content_type ?? 'unknown';
    }

    return 'unknown';
  }

  render() {
    if (!this.message) {
      return html``;
    }

    const rawContent = this.getRawContentJSON();

    return html`
      <div class="message-content">
        <div class="error-label">
          <span>Unsupported message content type: ${this.getContentTypeLabel()}</span>
        </div>
        <div class="content-block">
          <div class="label">
            <button
              class="svg-icon collapse-icon"
              ?is-collapsed=${this.isCollapsed}
              @click=${(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.isCollapsed = !this.isCollapsed;
              }}
            >
              ${unsafeHTML(iconTriangle)}
            </button>
            <span>Raw Content</span>
          </div>

          <div class="message-text-container" ?is-hidden=${this.isCollapsed}>
            <pre class="message-pre"><code>${this.getHighlightedCode(
              rawContent,
              'json'
            )}</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  static styles = [
    css`
      ${unsafeCSS(componentCSS)}
      ${unsafeCSS(prismCSS)}
    `
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'euphony-message-unsupported': EuphonyMessageUnsupported;
  }
}
