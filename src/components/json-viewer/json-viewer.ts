import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';

import prismCSS from '../../css/prism-coldark-auto.css?inline';
import componentCSS from './json-viewer.css?inline';

type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
interface JSONObject {
  [key: string]: JSONValue;
}

type JSONArray = JSONValue[];

/**
 * Json viewer element.
 */
@customElement('euphony-json-viewer')
export class EuphonyJsonViewer extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ attribute: false })
  data: JSONValue = null;

  @property({ type: Boolean, attribute: 'is-dark-theme' })
  isDarkTheme = false;

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
  willUpdate(changedProperties: PropertyValues<this>) {}

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  getHighlightedCode(code: string, language: string) {
    if (!(language in Prism.languages)) {
      return html`${code}`;
    }

    const grammar = Prism.languages[language];
    const codeHTML = Prism.highlight(code, grammar, language);
    return html`${unsafeHTML(codeHTML)}`;
  }

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    return html`
      <div class="json-viewer" ?is-dark-theme=${this.isDarkTheme}>
        <pre class="message-pre"><code>${this.getHighlightedCode(
          JSON.stringify(this.data, null, 2),
          'json'
        )}</code></pre>
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
    'euphony-json-viewer': EuphonyJsonViewer;
  }
}
