import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import componentCSS from './search-window.css?inline';

const queryExamples = [
  {
    query: '[?metadata.adversarial==`false`]',
    description: 'Find conversations whose ["metadata"]["adversarial"] is False'
  },
  {
    query: "[?contains(metadata.monster_meta.dataset_id, 'v7')]",
    description:
      'Find conversations whose ["metadata"]["monster_meta"]["dataset_id"] contains substring \'v7\''
  },
  {
    query: "[?metadata.count>`8` && contains(metadata.labels, 'K4')]",
    description:
      'Find conversations whose ["metadata"]["count"] is greater than 8 and ["metadata"]["labels"] list contains item "K4"'
  },
  {
    query: "[?messages[0].author.role=='assistant']",
    description: 'Find conversations whose first message is from the assistant'
  }
];

/**
 * Confirm window element.
 *
 */
@customElement('euphony-search-window')
export class EuphonySearchWindow extends LitElement {
  // ===== Class properties ======
  @query('div.search-window')
  windowElement: HTMLElement | undefined;

  @state()
  showErrorMessage = false;

  @state()
  errorMessage: string | null = null;

  @state()
  isOpen = false;
  @state()
  isSearching = false;

  // ===== Lifecycle Methods ======
  constructor() {
    super();
  }

  firstUpdated() {
    window.setTimeout(() => {}, 1000);
  }

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {}

  // ===== Custom Methods ======
  initData = async () => {};

  show() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }

  searchSucceeded() {
    this.showErrorMessage = false;
    this.isSearching = false;
    this.errorMessage = null;
    this.close();

    // Clean up the text area
    const textArea = this.shadowRoot?.querySelector('textarea');
    if (textArea) {
      textArea.value = '';
    }
  }

  searchFailed(errorMessage: string) {
    this.errorMessage = errorMessage;
    this.showErrorMessage = true;
    this.isSearching = false;
  }

  /**
   * Simple query validation
   * @param query - The query to validate
   * @returns True if the query is valid, false otherwise
   */
  isQueryValid(query: string) {
    const regex = /^\[\?.*\]$/;
    return regex.exec(query) !== null;
  }

  // ===== Event Methods ======

  cancelClicked(e: MouseEvent) {
    e.stopPropagation();
    // Keep the window open when it is searching
    if (this.isSearching) {
      return;
    }

    this.close();
  }

  confirmClicked(e: MouseEvent) {
    e.stopPropagation();

    if (this.isSearching) {
      return;
    }

    const textArea = this.shadowRoot?.querySelector('textarea');
    if (!textArea) {
      throw new Error('Text area not found');
    }

    // Validate the query
    const query = textArea.value;
    const isValid = this.isQueryValid(query);
    if (!isValid) {
      this.errorMessage = 'Make sure your query is formatted as [?expression]';
      this.showErrorMessage = true;
      return;
    }

    // Show the loader
    this.showErrorMessage = false;
    this.isSearching = true;

    // Notify the parent to send query request
    const event = new CustomEvent<string>('search-query-submitted', {
      bubbles: true,
      composed: true,
      detail: query
    });
    this.dispatchEvent(event);
  }

  /**
   * This method is called when the user starts dragging the window
   * @param event The mouse event
   */
  private onDragStart(event: MouseEvent) {
    event.preventDefault();

    if (!this.windowElement) {
      throw new Error('Window element not found');
    }

    // Check if the window top is using percentage. If so, we need to convert it
    // to pixels using the window size
    const windowTop = this.windowElement.style.top;

    const isWindowTopPercentage = windowTop.includes('%');
    if (isWindowTopPercentage) {
      const windowHeight = this.windowElement.clientHeight;
      const windowWidth = this.windowElement.clientWidth;
      const top = (window.innerHeight - windowHeight) / 2;
      const left = (window.innerWidth - windowWidth) / 2;
      this.windowElement.style.top = `${top}px`;
      this.windowElement.style.left = `${left}px`;
      this.windowElement.style.transform = '';
    }

    const initialX = event.clientX;
    const initialY = event.clientY;
    const initialTop = this.windowElement.offsetTop;
    const initialLeft = this.windowElement.offsetLeft;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      const deltaY = moveEvent.clientY - initialY;
      this.windowElement!.style.top = `${initialTop + deltaY}px`;
      this.windowElement!.style.left = `${initialLeft + deltaX}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ===== Templates and Styles ======
  render() {
    // Compile example list
    let exampleList = html``;
    for (const example of queryExamples) {
      exampleList = html`${exampleList}
        <li class="example-item">
          <div class="example-description">${example.description}</div>
          <pre class="example-query">${example.query}</pre>
        </li> `;
    }

    return html`
      <div class="back-drop" ?open=${this.isOpen}></div>
      <div class="search-window" ?open=${this.isOpen}>
        <div
          class="header"
          @mousedown=${(e: MouseEvent) => {
            this.onDragStart(e);
          }}
        >
          <div class="header-name">Filter data</div>
        </div>

        <div class="content">
          <div class="message">
            Use
            <a href="https://jmespath.org/tutorial.html" target="_blank"
              >JMESPath query</a
            >
            to filter conversation data
          </div>

          <div class="query-example">
            <div class="example-label">Examples</div>
            <ul class="example-list">
              ${exampleList}
            </ul>
          </div>

          <textarea
            class="query-input"
            rows="3"
            spellcheck="false"
            placeholder="[?metadata.adversarial==\`false\`]"
            @keydown=${(e: KeyboardEvent) => {
              e.stopPropagation();
            }}
          ></textarea>
        </div>

        <div class="footer">
          <div class="left-block">
            <!-- Important to avoid new line and whitespace here -->
            <!-- prettier-ignore -->
            <div class="error-message" ?no-show=${!this.showErrorMessage}>${this
              .errorMessage}</div>

            <div class="loader-container" ?is-loading=${this.isSearching}>
              <div class="loader-label">Filtering</div>
              <div class="loader"></div>
            </div>
          </div>

          <div class="button-block">
            <button
              class="cancel-button"
              @click=${(e: MouseEvent) => {
                this.cancelClicked(e);
              }}
            >
              Cancel
            </button>
            <button
              class="confirm-button"
              ?is-searching=${this.isSearching}
              @click=${(e: MouseEvent) => {
                this.confirmClicked(e);
              }}
            >
              Filter
            </button>
          </div>
        </div>
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
    'euphony-search-window': EuphonySearchWindow;
  }
}
