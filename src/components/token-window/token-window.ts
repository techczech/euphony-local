import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import {
  customElement,
  property,
  query,
  queryAll,
  state
} from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import iconInfo from '../../images/icon-info-circle-small.svg?raw';
import type {
  HarmonyRenderRequest,
  HarmonyRenderResponse,
  RefreshRendererListRequest
} from '../../types/common-types';
import { updatePopperOverlay } from '../../utils/utils';

import '../conversation/conversation';

import componentCSS from './token-window.css?inline';

const REFRESH_RENDERER_LIST_TIMEOUT = 60000;

/**
 * Confirm window element.
 *
 */
@customElement('euphony-token-window')
export class EuphonyTokenWindow extends LitElement {
  // ===== Class properties ======
  @state()
  conversationString: string | null = null;

  @state()
  selectedRenderer = 'o200k_harmony';

  @state()
  availableRenderers = ['o200k_harmony'];

  @query('div.token-window')
  windowElement: HTMLElement | undefined;

  @queryAll('.tab-button')
  tabButtons!: NodeListOf<HTMLButtonElement>;

  @state()
  showMessage = false;

  @state()
  message: string | null = null;

  @state()
  messageType: 'error' | 'success' = 'error';

  @state()
  isOpen = false;

  @state()
  isTokenizing = false;

  @state()
  selectedTab: 'conversation' | 'token' | 'token_id' | 'display_string' =
    'conversation';

  @state()
  tokens: number[] = [];

  @state()
  decodedTokens: string[] = [];

  @state()
  displayString = '';

  // Track the slider offset/width so the white highlight aligns to each tab's natural width.
  @state()
  private tabSliderLeft = 0;

  @state()
  private tabSliderWidth = 0;

  tabOptions: {
    key: EuphonyTokenWindow['selectedTab'];
    label: string;
  }[] = [
    { key: 'conversation', label: 'Conversation' },
    { key: 'token', label: 'Tokens' },
    { key: 'token_id', label: 'Token IDs' },
    { key: 'display_string', label: 'String' }
  ];

  // ===== Floating tooltip properties ======
  // The shared popper tooltip element used to render helper text for inline icons.
  @query('#popper-tooltip')
  popperTooltip: HTMLElement | undefined;

  rendererTooltipDebouncer: number | null = null;

  // ===== Lifecycle Methods ======
  constructor() {
    super();
  }

  firstUpdated() {
    window.setTimeout(() => {}, 1000);
    // Establish initial slider position once the DOM is ready.
    this.updateTabSliderPosition();
  }

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {}

  // ===== Custom Methods ======
  initData = async () => {};

  show(conversationString: string) {
    this.conversationString = conversationString;
    this.isOpen = true;

    // Refresh the renderer list when showing the component
    this.refreshRendererList();

    // Kick off rendering using the default renderer
    this.performHarmonyRender();
  }

  close() {
    this.isOpen = false;
  }

  tokenizationSucceeded(value: HarmonyRenderResponse) {
    this.tokens = value.tokens;
    this.decodedTokens = value.decoded_tokens;
    this.displayString = value.display_string;
    this.message = '';

    // Full success if there are no partial success error messages
    if (value.partial_success_error_messages.length === 0) {
      this.messageType = 'success';
      this.showMessage = true;
      this.message = `${this.tokens.length} tokens rendered from ${this.selectedRenderer}`;
    } else {
      this.message = `${this.tokens.length} tokens rendered from ${this.selectedRenderer}.\n`;
      this.messageType = 'error';
      this.showMessage = true;
      this.message += value.partial_success_error_messages.join('\n');
    }

    this.showMessage = true;
    this.isTokenizing = false;

    if (this.tokens.length > 0) {
      this.tabSelected('token');
    } else if (this.displayString.length > 0) {
      this.tabSelected('display_string');
    }
  }

  tokenizationFailed(errorMessage: string) {
    // Show an error message
    this.messageType = 'error';
    this.message = errorMessage;
    this.showMessage = true;
    this.isTokenizing = false;
  }

  performHarmonyRender() {
    if (!this.conversationString) {
      console.error('Conversation string not found');
      return;
    }
    this.tabSelected('conversation');
    this.tokens = [];
    this.decodedTokens = [];
    this.displayString = '';
    this.message = '';
    this.showMessage = false;
    this.isTokenizing = true;

    // Emit an event to parent to refresh the renderer list
    // Create deferred promises that we will send to the parent
    const { promise, resolve, reject } =
      Promise.withResolvers<HarmonyRenderResponse>();

    // Set a timer: if the promise is not resolved in N seconds, reject it
    const promiseTimer = window.setTimeout(() => {
      reject('Timeout');
    }, REFRESH_RENDERER_LIST_TIMEOUT);

    // Wrap the resolve and reject to clear the timer
    const wrappedResolve = (value: HarmonyRenderResponse) => {
      clearTimeout(promiseTimer);
      resolve(value);
    };

    const wrappedReject = (reason?: string) => {
      clearTimeout(promiseTimer);
      reject(reason);
    };

    // Emit the text, resolver, and rejecter to the parent
    const event = new CustomEvent<HarmonyRenderRequest>(
      'harmony-render-requested',
      {
        bubbles: true,
        composed: true,
        detail: {
          conversation: this.conversationString,
          renderer: this.selectedRenderer,
          resolve: wrappedResolve,
          reject: wrappedReject
        }
      }
    );

    // Dispatch the event to the parent
    this.dispatchEvent(event);

    promise.then(
      value => {
        this.tokenizationSucceeded(value);
      },
      (reason: unknown) => {
        console.error(
          'refresh-renderer-list-requested failed, reason: ',
          reason
        );
        this.tokenizationFailed(reason as string);
      }
    );
  }

  refreshRendererList() {
    // Emit an event to parent to refresh the renderer list
    // Create deferred promises that we will send to the parent
    const { promise, resolve, reject } = Promise.withResolvers<string[]>();

    // Set a timer: if the promise is not resolved in N seconds, reject it
    const promiseTimer = window.setTimeout(() => {
      reject('Timeout');
    }, REFRESH_RENDERER_LIST_TIMEOUT);

    // Wrap the resolve and reject to clear the timer
    const wrappedResolve = (value: string[]) => {
      clearTimeout(promiseTimer);
      resolve(value);
    };

    const wrappedReject = (reason?: string) => {
      clearTimeout(promiseTimer);
      reject(reason);
    };

    // Emit the text, resolver, and rejecter to the parent
    const event = new CustomEvent<RefreshRendererListRequest>(
      'refresh-renderer-list-requested',
      {
        bubbles: true,
        composed: true,
        detail: {
          resolve: wrappedResolve,
          reject: wrappedReject
        }
      }
    );

    // Dispatch the event to the parent
    this.dispatchEvent(event);

    promise.then(
      value => {
        this.availableRenderers = value;
      },
      (reason: unknown) => {
        console.error(
          'refresh-renderer-list-requested failed, reason: ',
          reason as string
        );
      }
    );
  }

  // ===== Event Methods ======

  /**
   * Updates the currently selected tab and drives the slider animation.
   * Using a dedicated handler keeps template bindings lean and readable.
   * @param tabKey - The tab identifier that should be selected.
   */
  tabSelected(tabKey: EuphonyTokenWindow['selectedTab']) {
    this.selectedTab = tabKey;
    this.updateTabSliderPosition();
  }

  /**
   * Returns the index of the selected tab for positional math.
   * Defaulting to zero keeps the slider predictable even if the array changes.
   */
  getSelectedTabIndex(): number {
    return Math.max(
      0,
      this.tabOptions.findIndex(option => option.key === this.selectedTab)
    );
  }

  /**
   * Measures the currently selected tab and updates CSS variables that control
   * the sliding highlight width/offset. Runs in rAF to ensure layout has settled.
   */
  updateTabSliderPosition() {
    window.requestAnimationFrame(() => {
      if (this.tabButtons.length === 0) {
        return;
      }

      const selectedIndex = this.getSelectedTabIndex();
      const targetButton = this.tabButtons[selectedIndex] ?? this.tabButtons[0];

      // offsetLeft/offsetWidth are relative to the tab container, so the slider aligns perfectly.
      const nextLeft = targetButton.offsetLeft;
      const nextWidth = targetButton.offsetWidth;

      if (
        this.tabSliderLeft !== nextLeft ||
        this.tabSliderWidth !== nextWidth
      ) {
        this.tabSliderLeft = nextLeft;
        this.tabSliderWidth = nextWidth;
      }
    });
  }

  /**
   * Ensure the slider is re-measured whenever relevant state flips (e.g., opening the modal
   * after it was hidden will otherwise report zero widths).
   */
  updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);

    if (changedProperties.has('isOpen')) {
      this.updateTabSliderPosition();
    }
  }

  /**
   * Handles clicks on the translucent backdrop to mirror typical modal behavior.
   * Prevents closing while tokenization is in-flight to avoid interrupting active work.
   * @param event - Mouse event emitted when the backdrop is clicked.
   */
  backdropClicked = (event: MouseEvent) => {
    event.stopPropagation();
    this.close();
  };

  cancelClicked(e: MouseEvent) {
    e.stopPropagation();
    this.close();
  }

  renderButtonClicked(e: MouseEvent) {
    e.stopPropagation();

    if (this.isTokenizing) {
      return;
    }

    this.performHarmonyRender();
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
    let convoResult = html``;
    if (this.conversationString) {
      convoResult = html`
        <euphony-conversation
          conversation-string=${this.conversationString}
          disable-translation-button
          disable-share-button
          disable-markdown-button
          disable-preference-button
          disable-image-preview-window
          disable-token-window
          disable-conversation-id-copy-button
        ></euphony-conversation>
      `;
    }

    let tokenResult = html` <div class="token-container empty-token-container">
      No tokens rendered
    </div>`;

    if (this.tokens.length > 0) {
      tokenResult = html`
        <div class="token-container decoded-token-container">
          ${this.decodedTokens.map(
            (d, i) =>
              html`<span
                class="decoded-token"
                color-index=${i % 5}
                title=${i < this.tokens.length ? `${d} (${this.tokens[i]})` : d}
                >${d}</span
              >`
          )}
        </div>
      `;
    }

    let tokenIdResult = html` <div
      class="token-container empty-token-container"
    >
      No tokens rendered
    </div>`;

    if (this.tokens.length > 0) {
      tokenIdResult = html`
        <div class="token-container token-id-container">
          ${this.tokens
            .entries()
            .map(
              ([i, d]) =>
                html`<span class="token-id"
                  >${d.toString()}${i == this.tokens.length - 1
                    ? ''
                    : ', '}</span
                >`
            )}
        </div>
      `;
    }

    let displayStringResult = html` <div
      class="token-container empty-token-container"
    >
      No display string rendered
    </div>`;

    if (this.displayString) {
      displayStringResult = html`
        <div class="token-container display-string-container">
          ${this.displayString}
        </div>
      `;
    }

    return html`
      <div
        class="back-drop"
        ?open=${this.isOpen}
        @click=${(event: MouseEvent) => {
          this.backdropClicked(event);
        }}
      ></div>
      <div class="token-window" ?open=${this.isOpen}>
        <div
          class="header"
          @mousedown=${(e: MouseEvent) => {
            this.onDragStart(e);
          }}
        >
          <div class="header-name">Harmony Conversation Tokenizer</div>
        </div>

        <div class="content">
          <div class="renderer-selector">
            <div class="renderer-selector-label">
              <span class="name">Tokenizer</span>
              <span
                class="svg-icon"
                @mouseenter=${(e: MouseEvent) => {
                  this.rendererInfoMouseEnter(e);
                }}
                @mouseleave=${() => {
                  this.rendererInfoMouseLeave();
                }}
              >
                ${unsafeHTML(iconInfo)}
              </span>
            </div>
            <div class="renderer-selector-select-container">
              <div class="renderer-selector-select-box">
                <select
                  class="renderer-selector-select"
                  aria-label="Select tokenizer"
                  .value=${this.selectedRenderer}
                  @change=${(e: Event) => {
                    this.selectedRenderer = (
                      e.target as HTMLSelectElement
                    ).value;
                  }}
                >
                  ${this.availableRenderers.map(
                    renderer =>
                      html`<option value="${renderer}">${renderer}</option>`
                  )}
                </select>
                <div class="renderer-selector-select-label">
                  ${this.selectedRenderer}
                </div>
              </div>
            </div>
          </div>

          <div class="token-result">
            <div
              class="tab-container"
              role="tablist"
              aria-label="Token view selector"
              style=${`--slider-left: ${this.tabSliderLeft}px; --slider-width: ${this.tabSliderWidth}px;`}
            >
              <div class="tab-slider"></div>
              ${this.tabOptions.map(
                option =>
                  html`<button
                    class="tab-button"
                    type="button"
                    role="tab"
                    aria-selected=${this.selectedTab === option.key}
                    data-selected=${this.selectedTab === option.key}
                    @click=${() => {
                      this.tabSelected(option.key);
                    }}
                  >
                    ${option.label}
                  </button>`
              )}
            </div>

            <div class="result-container">
              <div
                class="tab-panel"
                ?hidden=${this.selectedTab !== 'conversation'}
              >
                ${convoResult}
              </div>
              <div class="tab-panel" ?hidden=${this.selectedTab !== 'token'}>
                ${tokenResult}
              </div>
              <div class="tab-panel" ?hidden=${this.selectedTab !== 'token_id'}>
                ${tokenIdResult}
              </div>
              <div
                class="tab-panel"
                ?hidden=${this.selectedTab !== 'display_string'}
              >
                ${displayStringResult}
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="left-block">
            <!-- Important to avoid new line and whitespace here -->
            <!-- prettier-ignore -->
            <div class="message" message-type=${this
              .messageType} ?no-show=${!this.showMessage}>${this.message}</div>

            <div class="loader-container" ?is-loading=${this.isTokenizing}>
              <div class="loader-label">Rendering</div>
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
              class="render-button"
              ?is-rendering=${this.isTokenizing}
              @click=${(e: MouseEvent) => {
                this.renderButtonClicked(e);
              }}
            >
              Render
            </button>
          </div>
        </div>

        <div
          id="popper-tooltip"
          class="popper-tooltip hidden"
          role="tooltip"
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
          }}
        >
          <div class="popper-content">
            <span class="popper-label"
              >Choose a Harmony tokenizer to see how this conversation is
              serialized and tokenized.</span
            >
          </div>
          <div class="popper-arrow"></div>
        </div>
      </div>
    `;
  }

  /**
   * Handles mouse entering the renderer info icon by showing a delayed tooltip.
   * The delay prevents flickering when users quickly pass over the icon while moving the cursor.
   * @param event - The mouse event fired from the info icon.
   */
  rendererInfoMouseEnter(event: MouseEvent) {
    event.stopPropagation();

    if (!this.popperTooltip) {
      console.error('Popper tooltip not initialized.');
      return;
    }

    const anchor = event.currentTarget as HTMLElement;

    if (this.rendererTooltipDebouncer) {
      clearTimeout(this.rendererTooltipDebouncer);
    }

    this.rendererTooltipDebouncer = window.setTimeout(() => {
      const labelElement =
        this.popperTooltip!.querySelector<HTMLElement>('.popper-label');

      if (!labelElement) {
        console.error('Tooltip label element missing.');
        return;
      }

      updatePopperOverlay(this.popperTooltip!, anchor, 'top', true, 7);
      this.popperTooltip!.classList.remove('hidden');
    }, 300);
  }

  /**
   * Hides the renderer tooltip and clears any pending display timers.
   * @param useTransition - Whether the hide action should respect CSS transitions.
   */
  rendererInfoMouseLeave(useTransition = true) {
    if (!this.popperTooltip) {
      console.error('Popper tooltip not initialized.');
      return;
    }

    if (this.rendererTooltipDebouncer) {
      clearTimeout(this.rendererTooltipDebouncer);
      this.rendererTooltipDebouncer = null;
    }

    if (useTransition) {
      this.popperTooltip.classList.add('hidden');
    } else {
      this.popperTooltip.classList.add('no-transition');
      this.popperTooltip.classList.add('hidden');
      setTimeout(() => {
        this.popperTooltip!.classList.remove('no-transition');
      }, 150);
    }
  }

  static styles = [
    css`
      ${unsafeCSS(componentCSS)}
    `
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'euphony-token-window': EuphonyTokenWindow;
  }
}
