import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import {
  customElement,
  property,
  query,
  queryAsync,
  state
} from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import componentCSS from './menu.css?inline';

interface MenuItem {
  name: string;
  icon?: string;
}

/**
 * Menu element.
 *
 */
@customElement('nightjar-menu')
export class NightjarMenu extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ type: Array, attribute: false })
  menuItems: MenuItem[] = [];

  @state()
  isHidden = true;

  timer: null | number = null;

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();
  }

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {}

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  /**
   * Show the toast message
   */
  show() {
    if (this.isHidden) {
      this.isHidden = false;
    }
  }

  /**
   * Hide the toast message
   */
  hide() {
    if (this.isHidden) return;
    if (this.shadowRoot === null) {
      throw Error('Shadow root is null');
    }

    const menuElement = this.shadowRoot.querySelector<HTMLElement>('.menu');

    if (!menuElement) {
      throw Error('Menu element not found');
    }

    // Fade the element first
    const fadeOutAnimation = menuElement.animate(
      { opacity: [1, 0] },
      { duration: 200, easing: 'ease-in-out' }
    );

    // Hide the element after animation
    fadeOutAnimation.onfinish = () => {
      this.isHidden = true;
    };
  }

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  menuItemClicked(e: MouseEvent, menuItemName: string) {
    e.stopPropagation();
    e.preventDefault();

    const event = new CustomEvent<string>('menu-item-clicked', {
      bubbles: true,
      composed: true,
      detail: menuItemName
    });
    this.dispatchEvent(event);
  }

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    // Compile the menu items
    let menuItems = html``;
    for (const [_, menuItem] of this.menuItems.entries()) {
      const menuItemName = menuItem.name;
      const menuItemIcon = menuItem.icon;
      menuItems = html`${menuItems}<button
          class="menu-item"
          @click=${(e: MouseEvent) => {
            this.menuItemClicked(e, menuItemName);
          }}
        >
          <span class="svg-icon">${unsafeHTML(menuItemIcon)}</span>
          ${menuItemName}
        </button>`;
    }

    return html` <div class="menu">${menuItems}</div> `;
  }

  static styles = [
    css`
      ${unsafeCSS(componentCSS)}
    `
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'nightjar-menu': NightjarMenu;
  }
}
