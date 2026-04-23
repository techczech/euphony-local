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
import type { BlockContent } from '../../types/common-types';
import {
  getContentFromContentOrString,
  getContentTypeFromContent,
  Message,
  SystemContentMessageContent
} from '../../types/harmony-types';
import { getMarkdownTemplate } from '../../utils/utils';

import prismCSS from '../../css/prism-coldark-auto.css?inline';
import iconTriangle from '../../images/icon-play.svg?raw';
import componentCSS from './message-system-content.css?inline';

interface EditMetadata {
  location:
    | 'model_identity'
    | 'conversation_start_date'
    | 'knowledge_cutoff'
    | 'valid_channels'
    | 'channel_required';
  index: number | string;
}

export interface SystemContentEditPayload extends EditMetadata {
  newContent: string;
}

/**
 * Message system content element.
 */
@customElement('euphony-message-system-content')
export class EuphonyMessageSystemContent extends LitElement {
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
  isTranslation = false;

  @property({ type: Boolean })
  isEditable = false;

  /**
   * Optional URL to the current json/jsonl file (if any). This is used to
   * resolve some relative paths in the asset pointers in the conversation. For
   * example, `aquifer://foo` will be resolved to `dataFileURL/../assets/foo`.
   * We won't resolve relative paths if `dataFileURL` is not provided.
   */
  @property({ type: String, attribute: 'data-file-url' })
  dataFileURL: string | null = null;

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
        if (type !== 'system') {
          throw new Error(
            `Invalid message type, expect system, but got: ${type}`
          );
        }
      }

      // We transform the different blocks in the content into a structured list
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
    const payload: SystemContentEditPayload = {
      ...editMetadata,
      newContent: element.innerText
    };
    const event = new CustomEvent<SystemContentEditPayload>(
      'message-system-content-changed',
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
    ) as SystemContentMessageContent;

    // Model identity description
    if (content.model_identity) {
      this.blockContents.push({
        label: 'Model Identity',
        content: content.model_identity,
        isContentHTML: false,
        isCollapsed: false,
        editInfo: {
          location: 'model_identity',
          index: 0
        }
      });
    }

    // Conversation start date
    if (content.conversation_start_date) {
      this.blockContents.push({
        label: 'Conversation Start Date',
        content: content.conversation_start_date,
        isContentHTML: false,
        isCollapsed: false,
        editInfo: {
          location: 'conversation_start_date',
          index: 0
        }
      });
    }

    // Deprecated knowledge cutoffs
    if (content.knowledge_cutoff) {
      this.blockContents.push({
        label: 'Knowledge Cutoff',
        content: content.knowledge_cutoff,
        isContentHTML: false,
        isCollapsed: false,
        editInfo: {
          location: 'knowledge_cutoff',
          index: 0
        }
      });
    }

    // Tool section
    if (content.tools) {
      for (const namespace in content.tools) {
        let tableContent = html``;
        tableContent = html`${tableContent}
          <div class="cell-left">Name</div>
          <div class="cell-right">${content.tools[namespace].name}</div>`;

        if (content.tools[namespace].description) {
          tableContent = html`${tableContent}
            <div class="cell-left">Description</div>
            <div class="cell-right">
              ${content.tools[namespace].description}
            </div>`;
        }

        for (const [index, tool] of content.tools[namespace].tools.entries()) {
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
          isCollapsed: true
        });
      }
    }

    // Channel Config
    if (content.channel_config) {
      const channelConfigContent = html`
        <div class="config-table">
          <div class="cell-left">Valid Channels</div>
          <div class="cell-right">
            ${content.channel_config.valid_channels.join(', ')}
          </div>

          <div class="cell-left">Channel Required</div>
          <div class="cell-right">
            ${content.channel_config.channel_required ? 'True' : 'False'}
          </div>
        </div>
      `;

      const editableChannelConfigContent = html`
        <div class="config-table">
          <div class="cell-left">Valid Channels</div>
          <div class="cell-right">
            ${this.getEditableTemplate(
              content.channel_config.valid_channels.join(', '),
              {
                location: 'valid_channels',
                index: 'valid_channels'
              }
            )}
          </div>

          <div class="cell-left">Channel Required</div>
          <div class="cell-right">
            ${this.getEditableTemplate(
              content.channel_config.channel_required ? 'True' : 'False',
              {
                location: 'channel_required',
                index: 'channel_required'
              }
            )}
          </div>
        </div>
      `;

      this.blockContents.push({
        label: 'Channel Config',
        content: channelConfigContent,
        isContentHTML: true,
        isCollapsed: false,
        editableHTML: editableChannelConfigContent
      });
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

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  render() {
    if (this.message === null) {
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
            location: block.editInfo.location as EditMetadata['location'],
            index: block.editInfo.index
          });
        }
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
            ?is-translation=${this.isTranslation &&
          block.label.includes('Instruction')}
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
    'euphony-message-system-content': EuphonyMessageSystemContent;
  }
}
