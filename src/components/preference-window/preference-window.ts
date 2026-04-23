import SlSwitchElement from '@shoelace-style/shoelace/dist/components/switch/switch.js';
import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { config } from '../../config/config';
import { EUPHONY_MESSAGE_CONTENT_TYPES } from '../../types/harmony-types';
import { updatePopperOverlay } from '../../utils/utils';

import RadioGroupElement from '@shoelace-style/shoelace/dist/components/radio-group/radio-group.js';
import SlRangeElement from '@shoelace-style/shoelace/dist/components/range/range.js';

import '@shoelace-style/shoelace/dist/components/radio-group/radio-group.js';
import '@shoelace-style/shoelace/dist/components/radio/radio.js';
import '@shoelace-style/shoelace/dist/components/range/range.js';
import '@shoelace-style/shoelace/dist/components/switch/switch.js';

import iconClose from '../../images/icon-cross.svg?raw';
import iconTriangle from '../../images/icon-play.svg?raw';
import componentCSS from './preference-window.css?inline';

const MAX_MAX_MESSAGE_HEIGHT = 3000;
const DEFAULT_GRID_VIEW_COLUMN_WIDTH = 300;
const MIN_COMPARISON_COLUMN_WIDTH = 200;
const MAX_COMPARISON_COLUMN_WIDTH = 800;
const DEFAULT_COMPARISON_COLUMN_WIDTH = 300;

// Whether to show this option in the preference window
interface PreferenceOptions {
  maxMessageHeight: boolean;
  gridView: boolean;
  expandAndCollapseAll: boolean;
  advanced: boolean;
  messageLabel: boolean;
  focusMode: boolean;
  comparisonWidth: boolean;
}

interface DefaultPreferenceOptions {
  gridView: boolean;
  gridViewColumnWidth: number;
  comparisonWidth: number;
}

export interface MessageLabelSettings {
  absoluteTimestamp: boolean;
}

export interface AdvancedSettings {
  renderHTMLBlock: boolean;
}

export interface FocusModeSettings {
  author: string[];
  recipient: string[];
  contentType: string[];
}

const messageLabelSettingsDefault: MessageLabelSettings = {
  absoluteTimestamp: false
};

const advancedSettingsDefault: AdvancedSettings = {
  renderHTMLBlock: false
};

const focusModeSettingsDefault: FocusModeSettings = {
  author: [],
  recipient: [],
  contentType: []
};

// Focus mode options
const focusModeAuthorRoles = [
  'user',
  'assistant',
  'system',
  'developer',
  'tool'
].toSorted();
const focusModeRecipients = ['all'].toSorted();
const focusModeMessageContentTypes = [...EUPHONY_MESSAGE_CONTENT_TYPES].sort();

/**
 * Preference window element.
 */
@customElement('euphony-preference-window')
export class EuphonyPreferenceWindow extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @property({ type: Object })
  enabledOptions: PreferenceOptions = {
    maxMessageHeight: true,
    gridView: false,
    expandAndCollapseAll: true,
    advanced: true,
    messageLabel: true,
    focusMode: true,
    comparisonWidth: false
  };

  @property({ type: Object })
  defaultOptions: DefaultPreferenceOptions = {
    gridView: false,
    gridViewColumnWidth: DEFAULT_GRID_VIEW_COLUMN_WIDTH,
    comparisonWidth: DEFAULT_COMPARISON_COLUMN_WIDTH
  };

  @property({ type: Boolean, attribute: 'is-dark-theme', reflect: true })
  isDarkTheme = false;

  @state()
  useCustomMessageHeight = false;

  @state()
  preferenceMaxMessageHeightMode: 'automatic' | 'no-limit' | 'custom' =
    'automatic';

  @state()
  preferenceCustomMaxMessageHeight = 300;

  @state()
  preferenceCustomGridViewColumnWidth = DEFAULT_GRID_VIEW_COLUMN_WIDTH;

  @state()
  preferenceCustomComparisonWidth = DEFAULT_COMPARISON_COLUMN_WIDTH;

  @state()
  isAdvancedSectionCollapsed = true;

  @state()
  isFocusModeSectionCollapsed = true;

  messageLabelSettings: MessageLabelSettings = {
    ...messageLabelSettingsDefault
  };

  advancedSettings: AdvancedSettings = {
    ...advancedSettingsDefault
  };

  focusModeSettings: FocusModeSettings = {
    ...focusModeSettingsDefault
  };

  @state()
  isGridView = false;

  @query('#radio-group-max-message-height')
  radioGroupMaxMessageHeight: null | undefined | RadioGroupElement;

  @query('#radio-group-layout')
  radioGroupLayout: null | undefined | RadioGroupElement;

  // Floating UIs
  @query('#popper-tooltip')
  popperTooltip: HTMLElement | undefined;

  // Debouncers
  tooltipDebouncer: number | null = null;

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();
  }

  loadPreferencesFromStorage() {
    // Message height
    const maxMessageHeightMode = window.localStorage.getItem(
      'preference-max-message-height-mode'
    );
    if (maxMessageHeightMode) {
      this.preferenceMaxMessageHeightMode = maxMessageHeightMode as
        | 'automatic'
        | 'no-limit'
        | 'custom';

      this.useCustomMessageHeight =
        this.preferenceMaxMessageHeightMode === 'custom';
    }

    const maxMessageHeight = window.localStorage.getItem(
      'preference-max-message-height'
    );
    if (maxMessageHeight) {
      this.preferenceCustomMaxMessageHeight = Math.max(
        0,
        Math.min(MAX_MAX_MESSAGE_HEIGHT, parseInt(maxMessageHeight))
      );
    }

    // Notify the parent if it is not the default value (automatic)
    if (this.preferenceMaxMessageHeightMode !== 'automatic') {
      this.notifyParentMaxMessageHeight();
    }

    // Persisted comparison width keeps the multi-column grid usable across reloads.
    const storedComparisonWidth = window.localStorage.getItem(
      'preference-comparison-width'
    );
    if (storedComparisonWidth) {
      const parsedComparisonWidth = parseInt(storedComparisonWidth);
      this.preferenceCustomComparisonWidth = Math.max(
        MIN_COMPARISON_COLUMN_WIDTH,
        Math.min(MAX_COMPARISON_COLUMN_WIDTH, parsedComparisonWidth)
      );

      if (
        this.preferenceCustomComparisonWidth !== DEFAULT_COMPARISON_COLUMN_WIDTH
      ) {
        this.notifyParentComparisonWidth();
      }
    }

    // Message label settings
    const messageLabelSettings = window.localStorage.getItem(
      'preference-message-label-settings'
    );
    if (messageLabelSettings) {
      this.messageLabelSettings = JSON.parse(
        messageLabelSettings
      ) as MessageLabelSettings;

      if (
        this.messageLabelSettings.absoluteTimestamp !==
          messageLabelSettingsDefault.absoluteTimestamp
      ) {
        this.notifyParentMessageLabelSettings();
      }
    }

    // Advanced settings
    const advancedSettings = window.localStorage.getItem(
      'preference-advanced-settings'
    );
    if (advancedSettings) {
      const parsedAdvancedSettings = JSON.parse(
        advancedSettings
      ) as AdvancedSettings;
      this.advancedSettings = {
        ...advancedSettingsDefault,
        ...parsedAdvancedSettings
      };
    }

    // Focus mode settings
    const focusModeSettings = window.localStorage.getItem(
      'preference-focus-mode-settings'
    );
    if (focusModeSettings) {
      this.focusModeSettings = JSON.parse(
        focusModeSettings
      ) as FocusModeSettings;
      if (
        this.focusModeSettings.author.length > 0 ||
        this.focusModeSettings.recipient.length > 0 ||
        this.focusModeSettings.contentType.length > 0
      ) {
        this.notifyParentFocusModeSettings();
      }
    }
  }

  writePreferencesToStorage() {
    window.localStorage.setItem(
      'preference-max-message-height-mode',
      this.preferenceMaxMessageHeightMode
    );

    window.localStorage.setItem(
      'preference-max-message-height',
      this.preferenceCustomMaxMessageHeight.toString()
    );

    // Keep the comparison grid width sticky between sessions for consistency.
    window.localStorage.setItem(
      'preference-comparison-width',
      this.preferenceCustomComparisonWidth.toString()
    );

    window.localStorage.setItem(
      'preference-message-label-settings',
      JSON.stringify(this.messageLabelSettings)
    );

    window.localStorage.setItem(
      'preference-advanced-settings',
      JSON.stringify(this.advancedSettings)
    );

    window.localStorage.setItem(
      'preference-focus-mode-settings',
      JSON.stringify(this.focusModeSettings)
    );
  }

  /**
   * This method is called when the DOM is added for the first time
   */
  firstUpdated() {
    // Initialize the preferences from the storage
    this.loadPreferencesFromStorage();
  }

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('defaultOptions')) {
      this.isGridView = this.defaultOptions.gridView;
      this.preferenceCustomGridViewColumnWidth =
        this.defaultOptions.gridViewColumnWidth;
      this.preferenceCustomComparisonWidth =
        this.defaultOptions.comparisonWidth;
    }
  }

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {}

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  /**
   * This method is called when the user starts dragging the window
   * @param event The mouse event
   */
  private onDragStart(event: MouseEvent) {
    event.preventDefault();
    const initialX = event.clientX;
    const initialY = event.clientY;
    const initialTop = this.offsetTop;
    const initialLeft = this.offsetLeft;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      const deltaY = moveEvent.clientY - initialY;
      this.style.top = `${initialTop + deltaY}px`;
      this.style.left = `${initialLeft + deltaX}px`;
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Max message height
  maxMessageHeightRadioChanged() {
    if (!this.radioGroupMaxMessageHeight) {
      throw Error('Radio group max message height not found');
    }
    const newValue = this.radioGroupMaxMessageHeight.value;

    switch (newValue) {
      case 'automatic':
        this.preferenceMaxMessageHeightMode = 'automatic';
        this.useCustomMessageHeight = false;
        break;
      case 'no-limit':
        this.preferenceMaxMessageHeightMode = 'no-limit';
        this.useCustomMessageHeight = false;
        break;
      case 'custom':
        this.preferenceMaxMessageHeightMode = 'custom';
        this.useCustomMessageHeight = true;
        break;
      default:
        throw Error(`Invalid value for max message height: ${newValue}`);
    }
    this.writePreferencesToStorage();
    this.notifyParentMaxMessageHeight();
  }

  maxMessageHeightRangeInput(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomMaxMessageHeight = range.value;
    this.notifyParentMaxMessageHeight();
  }

  maxMessageHeightRangeChanged(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomMaxMessageHeight = range.value;
    // Only write to storage when the user finishes dragging the range
    this.writePreferencesToStorage();
    this.notifyParentMaxMessageHeight();
  }

  // Layout
  layoutRadioChanged() {
    if (!this.radioGroupLayout) {
      throw Error('Radio group layout not found');
    }
    const newValue = this.radioGroupLayout.value;

    switch (newValue) {
      case 'list':
        this.isGridView = false;
        break;
      case 'grid':
        this.isGridView = true;
        break;
      default:
        throw Error(`Invalid value for layout: ${newValue}`);
    }
    this.notifyParentLayoutChange(newValue);
    if (newValue === 'grid') {
      this.notifyParentGridViewColumnWidth();
    }
  }

  gridViewColumnWidthRangeInput(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomGridViewColumnWidth = range.value;
    this.notifyParentGridViewColumnWidth();
  }

  gridViewColumnWidthRangeChanged(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomGridViewColumnWidth = range.value;
    // Only write to storage when the user finishes dragging the range
    this.writePreferencesToStorage();
    this.notifyParentGridViewColumnWidth();
  }

  // Comparison width slider mirrors the max message/image sliders so changes feel consistent.
  comparisonWidthRangeInput(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomComparisonWidth = range.value;
    this.notifyParentComparisonWidth();
  }

  comparisonWidthRangeChanged(event: Event) {
    const range = event.target as SlRangeElement;
    this.preferenceCustomComparisonWidth = range.value;
    this.writePreferencesToStorage();
    this.notifyParentComparisonWidth();
  }

  // Expand all
  expandAllButtonClicked() {
    this.dispatchEvent(
      new Event('expand-all-clicked', {
        bubbles: true,
        composed: true
      })
    );
  }

  collapseAllButtonClicked() {
    this.dispatchEvent(
      new Event('collapse-all-clicked', {
        bubbles: true,
        composed: true
      })
    );
  }

  translateAllButtonClicked() {
    this.dispatchEvent(
      new Event('translate-all-clicked', {
        bubbles: true,
        composed: true
      })
    );
  }

  // Message label checkboxes
  messageLabelCheckBoxChanged(
    e: InputEvent,
    name: 'absoluteTimestamp'
  ) {
    const checkbox = e.target as HTMLInputElement;
    this.messageLabelSettings[name] = checkbox.checked;
    this.writePreferencesToStorage();
    this.notifyParentMessageLabelSettings();
  }

  advancedCheckboxChanged(e: InputEvent, name: 'renderHTMLBlock') {
    const checkbox = e.target as HTMLInputElement;
    this.advancedSettings[name] = checkbox.checked;
    this.writePreferencesToStorage();
    this.notifyParentAdvancedSettings();
  }

  // Focus mode checkboxes
  focusModeCheckBoxChanged(
    e: InputEvent,
    name: 'author' | 'recipient' | 'contentType',
    value: string
  ) {
    const checkbox = e.target as HTMLInputElement;
    if (checkbox.checked) {
      this.focusModeSettings[name].push(value);
    } else {
      this.focusModeSettings[name] = this.focusModeSettings[name].filter(
        v => v !== value
      );
    }
    this.writePreferencesToStorage();
    this.notifyParentFocusModeSettings();
  }

  /**
   * MouseEnter Event handler for all the buttons in the toolbar
   * @param e Mouse event
   */
  tooltipTargetMouseEnter(
    e: MouseEvent,
    type:
      | 'absoluteTimestamp'
      | 'renderHTMLBlock'
      | 'focusModeAuthor'
      | 'focusModeRecipient'
      | 'focusModeMessageContentType',
    suffix?: string
  ) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.popperTooltip) {
      console.error('Popper tooltip not initialized.');
      return;
    }

    const anchor = e.currentTarget as HTMLElement;

    if (this.tooltipDebouncer) {
      clearTimeout(this.tooltipDebouncer);
    }

    this.tooltipDebouncer = window.setTimeout(() => {
      // Update the content
      const labelElement = this.popperTooltip!.querySelector('.popper-label');
      let message = 'Button';
      switch (type) {
        case 'absoluteTimestamp': {
          message =
            "Always show the absolute timestamp of the message's create time instead of relative to the first message";
          break;
        }

        case 'renderHTMLBlock': {
          message =
            'Use a sandboxed iframe to render html code blocks in markdown. Refresh the page after changing this setting.';
          break;
        }

        case 'focusModeAuthor': {
          message = `Show messages with author ${suffix ? ` ${suffix}` : ''}`;
          break;
        }

        case 'focusModeRecipient': {
          message = `Show messages with recipient ${suffix ? ` ${suffix}` : ''}`;
          break;
        }

        case 'focusModeMessageContentType': {
          message = `Show messages with type ${suffix ? ` ${suffix}` : ''}`;
          break;
        }

        default: {
          break;
        }
      }
      labelElement!.textContent = message;

      updatePopperOverlay(this.popperTooltip!, anchor, 'top', true, 7);
      this.popperTooltip!.classList.remove('hidden');
    }, 500);
  }

  /**
   * MouseLeave Event handler for all the buttons in the toolbar
   * @param e Mouse event
   */
  tooltipTargetMouseLeave(useTransition = true) {
    if (!this.popperTooltip) {
      console.error('popperTooltip are not initialized yet.');
      return;
    }

    if (this.tooltipDebouncer) {
      clearTimeout(this.tooltipDebouncer);
      this.tooltipDebouncer = null;
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

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  notifyParentMaxMessageHeight() {
    let newHeight = '100vh';
    if (this.preferenceMaxMessageHeightMode === 'no-limit') {
      newHeight = 'none';
    } else if (this.preferenceMaxMessageHeightMode === 'custom') {
      newHeight = `${this.preferenceCustomMaxMessageHeight}px`;
    }

    const event = new CustomEvent<string>('max-message-height-changed', {
      bubbles: true,
      composed: true,
      detail: newHeight
    });
    this.dispatchEvent(event);
  }

  // Grid column width
  notifyParentGridViewColumnWidth() {
    const event = new CustomEvent<string>('grid-view-column-width-changed', {
      bubbles: true,
      composed: true,
      detail: `${this.preferenceCustomGridViewColumnWidth}px`
    });
    this.dispatchEvent(event);
  }

  notifyParentComparisonWidth() {
    const event = new CustomEvent<string>('comparison-width-changed', {
      bubbles: true,
      composed: true,
      detail: `${this.preferenceCustomComparisonWidth}px`
    });
    this.dispatchEvent(event);
  }

  notifyParentLayoutChange(layout: 'list' | 'grid') {
    const event = new CustomEvent<string>('layout-changed', {
      bubbles: true,
      composed: true,
      detail: layout
    });
    this.dispatchEvent(event);
  }

  notifyParentMessageLabelSettings() {
    const event = new CustomEvent<MessageLabelSettings>(
      'message-label-changed',
      {
        bubbles: true,
        composed: true,
        detail: this.messageLabelSettings
      }
    );
    this.dispatchEvent(event);
  }

  notifyParentAdvancedSettings() {
    const event = new CustomEvent<AdvancedSettings>('advanced-settings-changed', {
      bubbles: true,
      composed: true,
      detail: this.advancedSettings
    });
    this.dispatchEvent(event);
  }

  notifyParentFocusModeSettings() {
    const event = new CustomEvent<FocusModeSettings>(
      'focus-mode-settings-changed',
      {
        bubbles: true,
        composed: true,
        detail: this.focusModeSettings
      }
    );
    this.dispatchEvent(event);
  }

  //==========================================================================||
  //                           Templates and Styles                           ||
  render() {
    // Tooltip
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

    // Compile focus mode template
    // By author
    let focusModeAuthorBlock = html``;
    for (const role of focusModeAuthorRoles) {
      focusModeAuthorBlock = html`${focusModeAuthorBlock}
        <div
          class="checkbox-group"
          @mouseover=${(e: MouseEvent) => {
            this.tooltipTargetMouseEnter(e, 'focusModeAuthor', role);
          }}
          @mouseleave=${() => {
            this.tooltipTargetMouseLeave();
          }}
        >
          <input
            type="checkbox"
            id="checkbox-focus-mode-author-${role}"
            .checked=${this.focusModeSettings.author.includes(role)}
            @change=${(e: InputEvent) => {
              this.focusModeCheckBoxChanged(e, 'author', role);
            }}
          />
          <label for="checkbox-focus-mode-author-${role}">${role}</label>
        </div> `;
    }

    // By recipient
    let focusModeRecipientBlock = html``;
    for (const recipient of focusModeRecipients) {
      focusModeRecipientBlock = html`${focusModeRecipientBlock}
        <div
          class="checkbox-group"
          @mouseover=${(e: MouseEvent) => {
            this.tooltipTargetMouseEnter(e, 'focusModeRecipient', recipient);
          }}
          @mouseleave=${() => {
            this.tooltipTargetMouseLeave();
          }}
        >
          <input
            type="checkbox"
            id="checkbox-focus-mode-recipient-${recipient}"
            .checked=${this.focusModeSettings.recipient.includes(recipient)}
            @change=${(e: InputEvent) => {
              this.focusModeCheckBoxChanged(e, 'recipient', recipient);
            }}
          />
          <label for="checkbox-focus-mode-recipient-${recipient}"
            >${recipient}</label
          >
        </div> `;
    }

    // By content type
    let focusModeMessageContentTypeBlock = html``;
    for (const contentType of focusModeMessageContentTypes) {
      focusModeMessageContentTypeBlock = html`${focusModeMessageContentTypeBlock}
        <div
          class="checkbox-group"
          @mouseover=${(e: MouseEvent) => {
            this.tooltipTargetMouseEnter(
              e,
              'focusModeMessageContentType',
              contentType
            );
          }}
          @mouseleave=${() => {
            this.tooltipTargetMouseLeave();
          }}
        >
          <input
            type="checkbox"
            id="checkbox-focus-mode-content-type-${contentType}"
            .checked=${this.focusModeSettings.contentType.includes(contentType)}
            @change=${(e: InputEvent) => {
              this.focusModeCheckBoxChanged(e, 'contentType', contentType);
            }}
          />
          <label for="checkbox-focus-mode-content-type-${contentType}"
            >${contentType}</label
          >
        </div> `;
    }

    return html`
      ${tooltipTemplate}
      <div class="preference-window">
        <div
          class="header"
          @mousedown=${(e: MouseEvent) => {
            this.onDragStart(e);
          }}
        >
          <span class="title">Preferences</span>
          <button
            class="close-button svg-icon"
            @click=${() => {
              const event = new CustomEvent('preference-window-close-clicked', {
                bubbles: true,
                composed: true
              });
              this.dispatchEvent(event);
            }}
          >
            ${unsafeHTML(iconClose)}
          </button>
        </div>

        <div class="content">
          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.maxMessageHeight}
          >
            <div class="setting-block-header">Max Message Height</div>
            <div class="setting-block-content">
              <div class="form-row">
                <sl-radio-group
                  size="small"
                  name="max-message-height"
                  id="radio-group-max-message-height"
                  value=${this.preferenceMaxMessageHeightMode}
                  @sl-change=${() => {
                    this.maxMessageHeightRadioChanged();
                  }}
                >
                  <sl-radio size="small" value="automatic">Automatic</sl-radio>
                  <sl-radio size="small" value="no-limit">No Limit</sl-radio>
                  <sl-radio size="small" value="custom"
                    >Custom Height
                    (${this.preferenceCustomMaxMessageHeight}px)</sl-radio
                  >
                </sl-radio-group>
              </div>

              <div class="form-row">
                <sl-range
                  @sl-input=${(e: Event) => {
                    this.maxMessageHeightRangeInput(e);
                  }}
                  @sl-change=${(e: Event) => {
                    this.maxMessageHeightRangeChanged(e);
                  }}
                  ?disabled=${!this.useCustomMessageHeight}
                  min="50"
                  max=${MAX_MAX_MESSAGE_HEIGHT}
                  value=${this.preferenceCustomMaxMessageHeight}
                ></sl-range>
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.maxMessageHeight}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.messageLabel}
          >
            <div class="setting-block-header">Message Labels</div>
            <div class="setting-block-content">
              <div class="form-block checkbox-block">
                <div
                  class="checkbox-group"
                  @mouseover=${(e: MouseEvent) => {
                    this.tooltipTargetMouseEnter(e, 'absoluteTimestamp');
                  }}
                  @mouseleave=${() => {
                    this.tooltipTargetMouseLeave();
                  }}
                >
                  <input
                    type="checkbox"
                    id="checkbox-absolute-timestamp"
                    .checked=${this.messageLabelSettings.absoluteTimestamp}
                    @change=${(e: InputEvent) => {
                      this.messageLabelCheckBoxChanged(e, 'absoluteTimestamp');
                    }}
                  />
                  <label for="checkbox-absolute-timestamp"
                    >absolute timestamp</label
                  >
                </div>
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.messageLabel}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.gridView}
          >
            <div class="setting-block-header">Layout</div>
            <div class="setting-block-content">
              <div class="form-row">
                <sl-radio-group
                  size="small"
                  name="layout"
                  id="radio-group-layout"
                  value=${this.isGridView ? 'grid' : 'list'}
                  @sl-change=${() => {
                    this.layoutRadioChanged();
                  }}
                >
                  <sl-radio size="small" value="list">List View</sl-radio>
                  <sl-radio size="small" value="grid"
                    >Grid View (
                    ${this.preferenceCustomGridViewColumnWidth}px)</sl-radio
                  >
                </sl-radio-group>
              </div>

              <div class="form-row">
                  <sl-range
                    @sl-input=${(e: Event) => {
                      this.gridViewColumnWidthRangeInput(e);
                  }}
                  @sl-change=${(e: Event) => {
                    this.gridViewColumnWidthRangeChanged(e);
                  }}
                  min="200"
                  max="800"
                  ?disabled=${!this.isGridView}
                  value=${this.preferenceCustomGridViewColumnWidth}
                ></sl-range>
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.gridView}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.comparisonWidth}
          >
            <div class="setting-block-header">
              Comparison Width (${this.preferenceCustomComparisonWidth}px)
            </div>
            <div class="setting-block-content">
              <div class="form-row">
                <sl-range
                  @sl-input=${(e: Event) => {
                    this.comparisonWidthRangeInput(e);
                  }}
                  @sl-change=${(e: Event) => {
                    this.comparisonWidthRangeChanged(e);
                  }}
                  min=${MIN_COMPARISON_COLUMN_WIDTH}
                  max=${MAX_COMPARISON_COLUMN_WIDTH}
                  value=${this.preferenceCustomComparisonWidth}
                ></sl-range>
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.comparisonWidth}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.focusMode}
          >
            <div class="setting-block-header">
              <button
                class="svg-icon collapse-icon"
                ?is-collapsed=${this.isFocusModeSectionCollapsed}
                @click=${() => {
                  this.isFocusModeSectionCollapsed =
                    !this.isFocusModeSectionCollapsed;
                }}
              >
                ${unsafeHTML(iconTriangle)}
              </button>
              <span>Focus Mode</span>
            </div>
            <div
              class="setting-block-content"
              ?is-hidden=${this.isFocusModeSectionCollapsed}
            >
              <div class="form-block checkbox-block">
                <div class="form-block-header">Focus by author</div>
                ${focusModeAuthorBlock}
                <div class="form-block-header">Focus by recipient</div>
                ${focusModeRecipientBlock}
                <div class="form-block-header">Focus by content type</div>
                ${focusModeMessageContentTypeBlock}
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.focusMode}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.advanced}
          >
            <div class="setting-block-header">
              <button
                class="svg-icon collapse-icon"
                ?is-collapsed=${this.isAdvancedSectionCollapsed}
                @click=${() => {
                  this.isAdvancedSectionCollapsed =
                    !this.isAdvancedSectionCollapsed;
                }}
              >
                ${unsafeHTML(iconTriangle)}
              </button>
              <span>Advanced</span>
            </div>
            <div
              class="setting-block-content"
              ?is-hidden=${this.isAdvancedSectionCollapsed}
            >
              <div class="form-block checkbox-block">
                <div
                  class="checkbox-group"
                  @mouseover=${(e: MouseEvent) => {
                    this.tooltipTargetMouseEnter(e, 'renderHTMLBlock');
                  }}
                  @mouseleave=${() => {
                    this.tooltipTargetMouseLeave();
                  }}
                >
                  <input
                    type="checkbox"
                    id="checkbox-render-html-block"
                    .checked=${this.advancedSettings.renderHTMLBlock}
                    @change=${(e: InputEvent) => {
                      this.advancedCheckboxChanged(e, 'renderHTMLBlock');
                    }}
                  />
                  <label for="checkbox-render-html-block"
                    >render html code block</label
                  >
                </div>
              </div>
            </div>
          </div>

          <div
            class="divider"
            ?is-hidden=${!this.enabledOptions.advanced}
          ></div>

          <div
            class="setting-block"
            ?is-hidden=${!this.enabledOptions.expandAndCollapseAll}
          >
            <div class="setting-block-header">Quick Actions</div>
            <div class="setting-block-content">
              <div class="form-row form-row-quick-actions">
                <button
                  class="text-button"
                  @click=${() => {
                    this.expandAllButtonClicked();
                  }}
                >
                  Expand All
                </button>
                <button
                  class="text-button"
                  @click=${() => {
                    this.collapseAllButtonClicked();
                  }}
                >
                  Collapse All
                </button>
                <button
                  class="text-button"
                  @click=${() => {
                    this.translateAllButtonClicked();
                  }}
                >
                  Translate All
                </button>
              </div>
            </div>
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
    'euphony-preference-window': EuphonyPreferenceWindow;
  }
}
