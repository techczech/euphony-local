import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';

import {
  getContentFromContentOrString,
  getContentTypeFromContent
} from '../../types/harmony-types';
import { renderPatchPreview } from '../../utils/patch-preview';

import type { CodeMessageContent, Message } from '../../types/harmony-types';

import prismCSS from '../../css/prism-coldark-auto.css?inline';
import componentCSS from './message-code.css?inline';

/**
 * Message code element.
 */
@customElement('euphony-message-code')
export class EuphonyMessageCode extends LitElement {
  @property({ attribute: false })
  message: Message | null = null;

  constructor() {
    super();
  }

  firstUpdated() {}

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('message') && this.message) {
      const type = getContentTypeFromContent(this.message.content);
      if (type !== 'code') {
        throw new Error(`Invalid message type, expect code, but got: ${type}`);
      }
    }
  }

  async initData() {}

  getHighlightedCode(code: string, language?: string | null) {
    if (!language) {
      return html`${code}`;
    }
    if (!(language in Prism.languages)) {
      return html`${code}`;
    }

    const grammar = Prism.languages[language];
    const codeHTML = Prism.highlight(code, grammar, language);
    return html`${unsafeHTML(codeHTML)}`;
  }

  render() {
    if (!this.message) {
      return html``;
    }

    const content = getContentFromContentOrString(
      this.message.content
    ) as CodeMessageContent;
    const patchPreview = renderPatchPreview(content.text);

    return html`
      <div class="message-content">
        ${patchPreview ??
        html`
          <pre class="message-pre"><code>${this.getHighlightedCode(
            content.text,
            content.language
          )}</code></pre>
        `}
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
    'euphony-message-code': EuphonyMessageCode;
  }
}
