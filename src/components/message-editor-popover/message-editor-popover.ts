import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import iconCheck from '../../images/icon-check.svg?raw';
import iconChevron from '../../images/icon-chevron-up-sm.svg?raw';
import iconCross from '../../images/icon-cross.svg?raw';
import { Role, type Message } from '../../types/harmony-types';
import componentCSS from './message-editor-popover.css?inline';

// Keep role options aligned with the current harmony type surface.
const VALID_ROLES: Role[] = [
  Role.User,
  Role.Assistant,
  Role.System,
  Role.Developer,
  Role.Tool
];

export interface MessageEditorUserSetData {
  role: Role;
  name: string | null;
  recipient: string | null;
  channel: string | null;
}

/**
 * Floating editor used in conversation editing mode for quick message metadata
 * edits (author role/name, recipient, and channel).
 */
@customElement('euphony-message-editor-popover')
export class EuphonyMessageEditorPopover extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  /**
   * Message being edited. The component copies its current values into local
   * editable state when this property changes so users can cancel safely.
   */
  @property({ attribute: false })
  message: Message | null = null;

  @state()
  selectedRole: Role = Role.User;

  @state()
  authorName = '';

  @state()
  recipient = '';

  @state()
  channel = '';

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();
  }

  firstUpdated() {}

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('message')) {
      // Sync editor fields from the new target message exactly once per open /
      // target switch so in-progress user edits are not clobbered by rerenders.
      const message = this.message;
      if (!message) {
        return;
      }
      this.selectedRole = message.role;
      this.authorName = message.name ?? '';
      this.recipient = message.recipient ?? '';
      this.channel = message.channel ?? '';
    }
  }

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  private saveButtonClick() {
    const payload: MessageEditorUserSetData = {
      role: this.selectedRole,
      // Normalize blank strings to null so serialized output stays compact and
      // matches existing optional-field usage in the repo.
      name: this.authorName.trim() === '' ? null : this.authorName,
      recipient: this.recipient.trim() === '' ? null : this.recipient,
      channel: this.channel.trim() === '' ? null : this.channel
    };

    this.dispatchEvent(
      new CustomEvent<MessageEditorUserSetData>('save-button-clicked', {
        detail: payload,
        bubbles: true,
        composed: true
      })
    );
  }

  private cancelButtonClick() {
    this.dispatchEvent(
      new Event('cancel-button-clicked', {
        bubbles: true,
        composed: true
      })
    );
  }

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    return html`
      <div
        class="message-editor-popover"
        tabindex="0"
        @click=${(e: MouseEvent) => {
          // Prevent outside-click handlers on the parent conversation from
          // closing the popover when interacting with its controls.
          e.stopPropagation();
        }}
      >
        <div class="row-group">
          <div class="row-item">
            <div class="label">Role</div>
            <div class="editor-item">
              <span class="select-visible">
                ${this.selectedRole}
                <span class="svg-icon icon-chevron">
                  ${unsafeHTML(iconChevron)}
                </span>
              </span>
              <select
                .value=${this.selectedRole}
                @change=${(e: Event) => {
                  this.selectedRole = (e.target as HTMLSelectElement)
                    .value as Role;
                }}
              >
                ${VALID_ROLES.map(
                  role => html`<option
                    value=${role}
                    ?selected=${role === this.selectedRole}
                  >
                    ${role}
                  </option>`
                )}
              </select>
            </div>
          </div>

          <div class="row-item field-row compact-field-row">
            <div class="label">Channel</div>
            <input
              type="text"
              placeholder="optional"
              .value=${this.channel}
              @input=${(e: Event) => {
                this.channel = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        </div>

        <div class="row-group">
          <div class="row-item field-row">
            <div class="label">Author</div>
            <input
              type="text"
              placeholder="optional"
              .value=${this.authorName}
              @input=${(e: Event) => {
                this.authorName = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        </div>

        <div class="row-group">
          <div class="row-item field-row">
            <div class="label">Recipient</div>
            <input
              type="text"
              placeholder="optional"
              .value=${this.recipient}
              @input=${(e: Event) => {
                this.recipient = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        </div>

        <div class="row-group">
          <div class="row-item">
            <button
              class="text-button"
              @click=${() => {
                this.saveButtonClick();
              }}
            >
              <span class="svg-icon">${unsafeHTML(iconCheck)}</span>Save
            </button>
            <button
              class="text-button"
              @click=${() => {
                this.cancelButtonClick();
              }}
            >
              <span class="svg-icon">${unsafeHTML(iconCross)}</span>Cancel
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
    'euphony-message-editor-popover': EuphonyMessageEditorPopover;
  }
}
