import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { updatePopperOverlay } from '../../utils/utils';

import componentCSS from './floating-toolbar.css?inline';

export interface FloatingToolbarButton {
  name: string;
  tooltip: string;
  svgIcon: string;
}

const TOOLTIP_OFFSET = 5;

/**
 * Floating toolbar element.
 */
@customElement('euphony-floating-toolbar')
export class EuphonyFloatingToolbar extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ attribute: false })
  buttons: FloatingToolbarButton[] = [];

  @property({})
  disappearTimeout: number | null = null;

  @query('#popper-tooltip')
  popperTooltip: HTMLElement | undefined;

  lastAnchor: HTMLElement | null = null;

  // Debouncers
  toolbarTooltipDebouncer: number | null = null;

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

  updateCurrentTooltip(tooltip: string) {
    if (!this.popperTooltip) {
      console.error('Popper tooltip not initialized.');
      return;
    }

    if (!this.lastAnchor) {
      console.warn('Last anchor not initialized.');
      return;
    }

    const anchor = this.lastAnchor;
    const labelElement = this.popperTooltip.querySelector('.popper-label');
    labelElement!.textContent = tooltip;
    updatePopperOverlay(
      this.popperTooltip,
      anchor,
      'top',
      true,
      TOOLTIP_OFFSET
    );
  }

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  /**
   * MouseEnter Event handler for all the buttons in the toolbar
   * @param e Mouse event
   */
  toolButtonMouseEnter(e: MouseEvent, name: string) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.popperTooltip) {
      console.error('Popper tooltip not initialized.');
      return;
    }

    const anchor = e.currentTarget as HTMLElement;
    this.lastAnchor = anchor;

    if (this.toolbarTooltipDebouncer) {
      clearTimeout(this.toolbarTooltipDebouncer);
    }

    this.toolbarTooltipDebouncer = window.setTimeout(() => {
      // Update the content
      const labelElement = this.popperTooltip!.querySelector('.popper-label');
      let message = 'Button';
      const button = this.buttons.find(button => button.name === name);
      if (!button) {
        console.error(`Button ${name} not found.`);
        return;
      }
      message = button.tooltip;
      labelElement!.textContent = message;

      updatePopperOverlay(
        this.popperTooltip!,
        anchor,
        'top',
        true,
        TOOLTIP_OFFSET
      );
      this.popperTooltip!.classList.remove('hidden');
    }, 500);
  }

  /**
   * MouseLeave Event handler for all the buttons in the toolbar
   * @param e Mouse event
   */
  toolButtonMouseLeave(useTransition = true) {
    if (!this.popperTooltip) {
      console.error('popperTooltip are not initialized yet.');
      return;
    }

    if (this.toolbarTooltipDebouncer) {
      clearTimeout(this.toolbarTooltipDebouncer);
      this.toolbarTooltipDebouncer = null;
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

  toolbarMouseEnter() {
    if (this.disappearTimeout !== null) {
      // Avoid the parent's mouseleave event from triggering (hover trap)
      clearTimeout(this.disappearTimeout);
      this.disappearTimeout = null;
    }
  }

  toolbarMouseLeave() {
    const event = new Event('mouseleave', { bubbles: true, composed: true });
    this.dispatchEvent(event);
  }

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||

  render() {
    const tooltipTemplate = html`
      <div
        id="popper-tooltip"
        class="popper-tooltip hidden"
        role="tooltip"
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
        }}
      >
        <div class="popper-content">
          <span class="popper-label">Hello</span>
        </div>
        <div class="popper-arrow"></div>
      </div>
    `;

    // Compile the buttons
    let buttonsTemplate = html``;
    for (const button of this.buttons) {
      buttonsTemplate = html`${buttonsTemplate}
        <button
          class="icon svg-icon ${button.name}-button"
          @mouseenter=${(e: MouseEvent) => {
            this.toolButtonMouseEnter(e, button.name);
          }}
          @mouseleave=${() => {
            this.toolButtonMouseLeave();
          }}
          @click=${(e: MouseEvent) => {
            // Notify the parent
            const event = new CustomEvent<string>('button-clicked', {
              bubbles: true,
              composed: true,
              detail: button.name
            });
            this.dispatchEvent(event);
          }}
        >
          ${unsafeHTML(button.svgIcon)}
        </button> `;
    }

    return html`
      ${tooltipTemplate}
      <div
        class="floating-toolbar"
        @mouseenter=${() => {
          this.toolbarMouseEnter();
        }}
        @mouseleave=${() => {
          this.toolbarMouseLeave();
        }}
      >
        ${buttonsTemplate}
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
    'euphony-floating-toolbar': EuphonyFloatingToolbar;
  }
}
