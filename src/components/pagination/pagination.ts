import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import {
  customElement,
  property,
  query,
  queryAsync,
  state
} from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import componentCSS from './pagination.css?inline';

/**
 * Pagination element.
 *
 */
@customElement('nightjar-pagination')
export class NightjarPagination extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ type: Number })
  curPage = 1;

  @property({ type: Number })
  totalPageNum = 10;

  @property({ type: Number })
  pageWindowSize = 5;

  @property({ type: Number })
  itemsPerPage = 10;

  @property({ type: Array })
  itemsPerPageOptions = [10, 25, 50, 100];

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
  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('itemsPerPage')) {
      if (!this.itemsPerPageOptions.includes(this.itemsPerPage)) {
        const newItemsPerPageOptions = [...this.itemsPerPageOptions];
        newItemsPerPageOptions.push(this.itemsPerPage);
        newItemsPerPageOptions.sort((a, b) => a - b);
        this.itemsPerPageOptions = newItemsPerPageOptions;
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
  pageButtonClicked(name: string) {
    let newPage = this.curPage;
    if (name === 'Prev') {
      if (this.curPage > 1) {
        newPage -= 1;
      }
    } else if (name === 'Next') {
      if (this.curPage < this.totalPageNum) {
        newPage += 1;
      }
    } else {
      const pageNum = parseInt(name);
      if (this.curPage !== pageNum) {
        newPage = pageNum;
      }
    }

    const event = new CustomEvent<number>('page-clicked', {
      detail: newPage,
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  itemsPerPageChanged(e: InputEvent) {
    const target = e.target as HTMLSelectElement;
    const newItemsPerPage = parseInt(target.value);
    if (newItemsPerPage !== this.itemsPerPage) {
      this.itemsPerPage = newItemsPerPage;
      const event = new CustomEvent<number>('items-per-page-changed', {
        detail: newItemsPerPage,
        bubbles: true,
        composed: true
      });
      this.dispatchEvent(event);
    }
  }
  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  getPageButtonTemplate = (name: string) => {
    return html` <button
      class="page-button"
      ?is-cur-page=${this.curPage === parseInt(name)}
      @click=${() => {
        this.pageButtonClicked(name);
      }}
    >
      ${name}
    </button>`;
  };

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    // Compose the pagination
    let pagination = html``;

    if (this.totalPageNum <= this.pageWindowSize) {
      for (let i = 0; i < Math.max(this.totalPageNum, 1); i++) {
        pagination = html`${pagination}
        ${this.getPageButtonTemplate(`${i + 1}`)}`;
      }
    } else {
      const paginationPad = Math.floor((this.pageWindowSize - 1) / 2);
      let pageMin = this.curPage - paginationPad;
      let pageMax = this.curPage + paginationPad;

      if (pageMin < 1) {
        pageMin = 1;
        pageMax = this.pageWindowSize;
      } else if (pageMax > this.totalPageNum) {
        pageMin = this.totalPageNum - this.pageWindowSize + 1;
        pageMax = this.totalPageNum;
      }

      if (this.curPage > 1) {
        pagination = html`${pagination} ${this.getPageButtonTemplate('Prev')} `;
      }

      if (pageMin > 1) {
        pagination = html`${pagination} ${this.getPageButtonTemplate('1')}`;

        if (pageMin > 2) {
          pagination = html`${pagination} <span>...</span>`;
        }
      }

      for (let i = pageMin; i < pageMax + 1; i++) {
        pagination = html`${pagination}
        ${this.getPageButtonTemplate(i.toString())} `;
      }

      if (pageMax < this.totalPageNum) {
        if (pageMax < this.totalPageNum - 1) {
          pagination = html`${pagination}<span>...</span>`;
        }
        pagination = html`${pagination}
        ${this.getPageButtonTemplate(this.totalPageNum.toString())}`;
      }

      if (this.curPage < this.totalPageNum) {
        pagination = html`${pagination} ${this.getPageButtonTemplate('Next')} `;
      }
    }

    const selectTemplate = html`
      <div class="select-container">
        <span>Items per page:</span>
        <div class="item-select-wrapper">
          <select
            id="item-per-page-select"
            value="${this.itemsPerPage}"
            @change=${(e: InputEvent) => {
              this.itemsPerPageChanged(e);
            }}
          >
            ${this.itemsPerPageOptions.map(
              item =>
                html`<option
                  value="${item}"
                  ?selected=${item == this.itemsPerPage}
                >
                  ${item}
                </option>`
            )}
          </select>
        </div>
      </div>
    `;

    return html`
      <div class="pagination">
        <div class="page-buttons">${pagination}</div>
        ${selectTemplate}
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
    'nightjar-pagination': NightjarPagination;
  }
}
