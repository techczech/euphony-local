import {
  css,
  html,
  LitElement,
  PropertyValues,
  TemplateResult,
  unsafeCSS
} from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import * as Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import { getMarkdownTemplate } from '../../utils/utils';

import type { BlockContent } from '../../types/common-types';
import {
  DeveloperContentMessageContent,
  getContentFromContentOrString,
  getContentTypeFromContent,
  Message
} from '../../types/harmony-types';

import prismCSS from '../../css/prism-coldark-auto.css?inline';
import iconTriangle from '../../images/icon-play.svg?raw';
import componentCSS from './message-developer-content.css?inline';

interface EditMetadata {
  location:
    | 'instruction'
    | 'tool_namespace_name'
    | 'tool_namespace_description';
  index: number | string;
}

export interface DeveloperContentEditPayload extends EditMetadata {
  newContent: string;
}

/**
 * Message developer content element.
 */
@customElement('euphony-message-developer-content')
export class EuphonyMessageDeveloperContent extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ attribute: false })
  message: Message | null = null;

  @property({ type: Boolean })
  shouldRenderMarkdown = false;

  @property({ type: Array })
  markdownAllowedTags: string[] | null = null;

  @property({ type: Array })
  markdownAllowedAttributes: string[] | null = null;

  @property({ type: Boolean })
  isEditable = false;

  @state()
  blockContents: BlockContent[] = [];

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
  willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('message') ||
      changedProperties.has('isEditable')
    ) {
      // Validate the message is indeed a text message
      if (this.message) {
        const type = getContentTypeFromContent(this.message.content);
        if (type !== 'developer') {
          throw new Error(
            `Invalid message type, expect developer, but got: ${type}`
          );
        }
      }

      this.resetBlockContents();
    }
  }

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  messageTextChanged(e: InputEvent, editMetadata: EditMetadata) {
    const element = e.target as HTMLElement;
    const payload: DeveloperContentEditPayload = {
      ...editMetadata,
      newContent: element.innerText
    };
    const event = new CustomEvent<DeveloperContentEditPayload>(
      'message-developer-content-changed',
      {
        detail: payload,
        bubbles: true,
        composed: true
      }
    );
    this.dispatchEvent(event);
  }

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  resetBlockContents() {
    if (this.message === null) {
      throw new Error('Message is null');
    }

      this.blockContents = [];
    const content = getContentFromContentOrString(
      this.message.content
    ) as DeveloperContentMessageContent;
    const isCollapsed = !this.isEditable;

    // Instructions
    let instructions: string[] = [];
    if (typeof content.instructions === 'string') {
      instructions = [content.instructions];
    }

    for (const [i, instruction] of instructions.entries()) {
      this.blockContents.push({
        label: `Instruction #${i}`,
        content: instruction,
        isContentHTML: false,
        isCollapsed,
        editInfo: {
          location: 'instruction',
          index: i
        }
      });
    }

    // Tool section
    if (content.tools) {
      for (const namespace of Object.keys(content.tools)) {
        const toolNamespace = content.tools[namespace];
        let tableContent = this.renderNamespaceTable(
          namespace,
          toolNamespace.name,
          toolNamespace.description ?? '',
          false
        );

        for (const [index, tool] of toolNamespace.tools.entries()) {
          let innerTableContent = html``;

          innerTableContent = html`${innerTableContent}
            <div class="cell-left">Name</div>
            <div class="cell-right">${tool.name}</div>`;

          innerTableContent = html`${innerTableContent}
            <div class="cell-left">Description</div>
            <div class="cell-right">${tool.description}</div>`;

          if (tool.parameters) {
            innerTableContent = html`${innerTableContent}
              <div class="cell-left">Parameters</div>
              <div class="cell-right">
                ${JSON.stringify(tool.parameters, null, 2)}
              </div>`;
          }

          tableContent = html`${tableContent}
            <div class="cell-left">Tool ${index}</div>
            <div class="cell-right">
              <div class="content">
                <div class="config-table">${innerTableContent}</div>
              </div>
            </div> `;
        }

        tableContent = html`<div class="config-table">${tableContent}</div>`;

        this.blockContents.push({
          label: `Tool Namespace: ${namespace}`,
          content: tableContent,
          isContentHTML: true,
          isCollapsed,
          editableHTML: html`<div class="config-table">
            ${this.renderNamespaceTable(
              namespace,
              toolNamespace.name,
              toolNamespace.description ?? '',
              true
            )}
          </div>`
        });
      }
    }
  }

  getHighlightedCode(code: string, language: string) {
    if (!(language in Prism.languages)) {
      return html`${code}`;
    }

    const grammar = Prism.languages[language];
    const codeHTML = Prism.highlight(code, grammar, language);
    return html`${unsafeHTML(codeHTML)}`;
  }

  getEditableTemplate = (content: string, editMetadata: EditMetadata) => {
    return html` <!-- Important to avoid new line and whitespace here -->
      <!-- prettier-ignore -->
      <div
      class="message-text"
      contenteditable="true"
      .innerText=${content}
      @input=${(e: InputEvent) => {
        this.messageTextChanged(e, editMetadata);
      }}
    ></div>`;
  };

  renderNamespaceTable(
    namespaceKey: string,
    name: string,
    description: string,
    isEditable: boolean
  ) {
    return html`
      <div class="cell-left">Name</div>
      <div class="cell-right">
        ${isEditable
          ? this.getEditableTemplate(name, {
              location: 'tool_namespace_name',
              index: namespaceKey
            })
          : name}
      </div>
      <div class="cell-left">Description</div>
      <div class="cell-right">
        ${isEditable
          ? this.getEditableTemplate(description, {
              location: 'tool_namespace_description',
              index: namespaceKey
            })
          : description}
      </div>
    `;
  }

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    if (!this.message) {
      return html``;
    }

    let contentBlocks = html``;

    for (const block of this.blockContents) {
      let contentTemplate = html``;
      if (block.isContentHTML) {
        if (!this.isEditable || block.editableHTML === undefined) {
          contentTemplate = html`${block.content as TemplateResult}`;
        } else {
          contentTemplate = html`${block.editableHTML}`;
        }
      } else {
        if (!this.isEditable || block.editInfo === undefined) {
          contentTemplate = getMarkdownTemplate(
            block.content as string,
            this.shouldRenderMarkdown,
            this.markdownAllowedTags,
            this.markdownAllowedAttributes
          );
        } else {
          contentTemplate = this.getEditableTemplate(block.content as string, {
            location: 'instruction',
            index: block.editInfo.index
          });
        }
      }

      // Support level-2 sub blocks
      // To support more levels, we need to refactor this to be recursive
      if (block.subBlocks && block.subBlocks.length > 0) {
        let subBlocks = html``;
        for (const subBlock of block.subBlocks) {
          let subContentTemplate = html``;
          if (subBlock.isContentHTML) {
            subContentTemplate = html`${subBlock.content as TemplateResult}`;
          } else {
            subContentTemplate = getMarkdownTemplate(
              subBlock.content as string,
              this.shouldRenderMarkdown,
              this.markdownAllowedTags,
              this.markdownAllowedAttributes
            );
          }

          subBlocks = html`${subBlocks}
            <div class="content-block">
              <div class="label">
                <button
                  class="svg-icon collapse-icon"
                  ?is-collapsed=${subBlock.isCollapsed}
                  @click=${(e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    subBlock.isCollapsed = !subBlock.isCollapsed;
                    this.requestUpdate();
                  }}
                >
                  ${unsafeHTML(iconTriangle)}
                </button>
                <span>${subBlock.label}</span>
              </div>

              <!-- Important to avoid new line and whitespace here -->
              <!-- prettier-ignore -->
              <div class="message-text-container"
                ?is-hidden=${subBlock.isCollapsed}
              >${subContentTemplate}</div>
            </div> `;
        }

        contentTemplate = html`${contentTemplate}${subBlocks}`;
      }

      contentBlocks = html`${contentBlocks}
        <div class="content-block">
          <div class="label">
            <button
              class="svg-icon collapse-icon"
              ?is-collapsed=${block.isCollapsed}
              @click=${(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                block.isCollapsed = !block.isCollapsed;
                this.requestUpdate();
              }}
            >
              ${unsafeHTML(iconTriangle)}
            </button>
            <span>${block.label}</span>
          </div>

          <!-- Important to avoid new line and whitespace here -->
          <!-- prettier-ignore -->
          <div class="message-text-container"
            ?is-hidden=${block.isCollapsed}
          >${contentTemplate}</div>
        </div> `;
    }

    return html` <div class="message-content">${contentBlocks}</div> `;
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
    'euphony-message-developer-content': EuphonyMessageDeveloperContent;
  }
}
