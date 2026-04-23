import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import componentCSS from './input-dialog.css?inline';

export interface DialogInfo {
  header: string;
  message: string;
  yesButtonText: string;
  errorMessage?: string;
}

/**
 * Confirm dialog element.
 *
 */
@customElement('nightjar-input-dialog')
export class NightjarInputDialog extends LitElement {
  // ===== Class properties ======
  @query('dialog')
  dialogElement: HTMLDialogElement | undefined;

  @state()
  header = 'Delete Item';

  @state()
  message =
    'Are you sure you want to delete this item? This action cannot be undone.';

  @state()
  yesButtonText = 'Delete';

  @state()
  errorMessage = 'Invalid input, please try again.';

  @state()
  isError = false;

  @state()
  isLoading = false;

  inputStorageKey = 'deletion';
  confirmAction: (input: string) => void;
  cancelAction: () => void;
  inputValidate: (input: string) => Promise<boolean> | boolean;
  // ===== Lifecycle Methods ======
  constructor() {
    super();
    this.confirmAction = (input: string) => {};
    this.cancelAction = () => {};
    this.inputValidate = () => true;
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

  show(
    dialogInfo: DialogInfo,
    confirmAction: (input: string) => void,
    cancelAction?: () => void,
    inputValidate?: (input: string) => Promise<boolean> | boolean
  ) {
    this.header = dialogInfo.header;
    this.message = dialogInfo.message;
    this.yesButtonText = dialogInfo.yesButtonText;
    this.confirmAction = confirmAction;
    this.errorMessage = dialogInfo.errorMessage || this.errorMessage;
    if (cancelAction === undefined) {
      this.cancelAction = () => {};
    } else {
      this.cancelAction = cancelAction;
    }

    if (inputValidate === undefined) {
      this.inputValidate = () => true;
    } else {
      this.inputValidate = inputValidate;
    }

    if (this.dialogElement) {
      this.dialogElement.showModal();
    }
  }

  // ===== Event Methods ======
  dialogClicked(e: MouseEvent) {
    if (e.target === this.dialogElement) {
      this.dialogElement.close();
    }
  }

  cancelClicked(e: MouseEvent) {
    e.stopPropagation();
    if (this.dialogElement) {
      this.dialogElement.close();
      this.cancelAction();
    }
  }

  async confirmClicked(e: MouseEvent) {
    e.stopPropagation();

    if (this.dialogElement) {
      const input =
        this.dialogElement.querySelector<HTMLInputElement>('#input-element');

      this.isLoading = true;
      this.isError = false;

      const inputValue = input?.value || '';

      if (await this.inputValidate(inputValue)) {
        this.isLoading = false;
        this.confirmAction(inputValue);
        this.dialogElement.close();
      } else {
        // show error if validation fails
        this.isLoading = false;
        this.isError = true;
      }
    }
  }

  // ===== Templates and Styles ======
  render() {
    return html`
      <dialog
        class="input-dialog"
        @click=${(e: MouseEvent) => {
          this.dialogClicked(e);
        }}
      >
        <div class="header">
          <div class="header-name">${this.header}</div>
        </div>

        <div class="content">
          <div class="message">${this.message}</div>

          <div class="input-container">
            <sl-input
              id="input-element"
              size="medium"
              placeholder="OpenAI API Key"
              clearable
              spellcheck="false"
            >
            </sl-input>
          </div>
        </div>

        <div class="footer-container">
          <div class="message validating-message" ?is-hidden=${!this.isLoading}>
            Validating...
          </div>
          <div class="message error-message" ?is-hidden=${!this.isError}>
            ${this.errorMessage}
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
              @click=${(e: MouseEvent) => {
                this.confirmClicked(e);
              }}
            >
              ${this.yesButtonText}
            </button>
          </div>
        </div>
      </dialog>
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
    'nightjar-input-dialog': NightjarInputDialog;
  }
}
