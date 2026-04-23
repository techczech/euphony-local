import { downloadText } from '@xiaohk/utils';
import { format } from 'd3-format';
import { css, html, LitElement, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type {
  HarmonyRenderRequest,
  MessageSharingRequest,
  RefreshRendererListRequest,
  TranslationRequest
} from '../../types/common-types';
import type { Conversation } from '../../types/harmony-types';
import {
  APIManager,
  BrowserAPIManager,
  EUPHONY_API_URL
} from '../../utils/api-manager';
import {
  connectCodexDirectory,
  ensureDirectoryPermission,
  getCodexHistoryFile,
  getCodexIndexFile,
  getLatestArchivedCodexFile,
  getStoredCodexDirectoryHandle,
  isFileSystemAccessSupported
} from '../../utils/codex-local';
import { isCodexSessionJSONL } from '../../utils/codex-session';
import { updatePopperOverlay } from '../../utils/utils';
import { EuphonyCodex } from '../codex/codex';
import { NightjarConfirmDialog } from '../confirm-dialog/confirm-dialog';
import {
  EuphonyConversation,
  parseConversationJSONString
} from '../conversation/conversation';
import { NightjarInputDialog } from '../input-dialog/input-dialog';
import type {
  FocusModeSettings,
  MessageLabelSettings
} from '../preference-window/preference-window';
import { EuphonySearchWindow } from '../search-window/search-window';
import { NightjarToast } from '../toast/toast';
import { EuphonyTokenWindow } from '../token-window/token-window';
import type { LocalDataWorkerMessage } from './local-data-worker';
import LocalDataWorkerInline from './local-data-worker?worker';
import { RequestWorker } from './request-worker';
import { URLManager } from './url-manager';

import '@shoelace-style/shoelace/dist/components/copy-button/copy-button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import shoelaceCSS from '@shoelace-style/shoelace/dist/themes/light.css?inline';
import iconArrowUp from '../../images/icon-arrow-up.svg?raw';
import iconInfo from '../../images/icon-burger.svg?raw';
import iconCode from '../../images/icon-code-comment.svg?raw';
import iconClose from '../../images/icon-cross.svg?raw';
import iconEdit from '../../images/icon-edit.svg?raw';
import iconInfoSmall from '../../images/icon-info-circle-small.svg?raw';
import iconLaptop from '../../images/icon-macbook.svg?raw';
import iconSetting from '../../images/icon-settings.svg?raw';

import '../codex/codex';
import '../confirm-dialog/confirm-dialog';
import '../conversation/conversation';
import '../input-dialog/input-dialog';
import '../json-viewer/json-viewer';
import '../menu/menu';
import '../pagination/pagination';
import '../preference-window/preference-window';
import '../search-window/search-window';
import '../toast/toast';
import '../token-window/token-window';

import componentCSS from './app.css?inline';

export interface ToastMessage {
  message: string;
  type: 'success' | 'warning' | 'error';
}

enum DataType {
  CONVERSATION = 'conversation',
  CODEX = 'codex',
  JSON = 'json'
}

type MenuItems =
  | 'Choose different Codex folder'
  | 'Editor mode'
  | 'Leave editor mode'
  | 'Preferences'
  | 'Code';

type HomeBrowseView = 'sessions' | 'projects';

const NUM_FORMATTER = format(',d');
const DEFAULT_ITEMS_PER_PAGE = 10;
const HEADER_HEIGHT = 72;
const DEFAULT_CODEX_DIRECTORY = '~/.codex';
const LOCAL_CODEX_OVERRIDE_STORAGE_KEY = 'euphony.localCodexBaseDir';

interface CodexSessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

interface CodexSessionSummaryEntry {
  entry_type: 'codex_session_summary';
  source_kind: 'legacy' | 'archived' | 'session-jsonl';
  session_id: string;
  thread_name?: string;
  updated_at?: string;
  cwd?: string | null;
  project_name?: string | null;
  folder_path?: string | null;
  first_user_text?: string;
  open_blob_url: string;
}

interface CodexProjectSummaryEntry {
  entry_type: 'codex_project_summary';
  project_name: string;
  folder_path: string;
  session_count: number;
}

interface QMDSearchEntry {
  title: string;
  file: string;
  snippet: string;
  score?: number | null;
  collection: string;
  match_types?: string[];
  open_blob_url?: string | null;
  source_kind?: string | null;
  session_id?: string | null;
  project_name?: string | null;
  folder_path?: string | null;
}

const isCodexSessionIndexEntry = (
  data: Record<string, unknown>
): data is Record<string, unknown> & CodexSessionIndexEntry =>
  typeof data.id === 'string' &&
  ('thread_name' in data || 'updated_at' in data);

const isCodexSessionSummaryEntry = (
  data: Record<string, unknown>
): data is Record<string, unknown> & CodexSessionSummaryEntry =>
  data.entry_type === 'codex_session_summary' &&
  typeof data.session_id === 'string' &&
  typeof data.open_blob_url === 'string';

const isCodexProjectSummaryEntry = (
  data: Record<string, unknown>
): data is Record<string, unknown> & CodexProjectSummaryEntry =>
  data.entry_type === 'codex_project_summary' &&
  typeof data.project_name === 'string' &&
  typeof data.folder_path === 'string';

type ToastType = 'success' | 'warning' | 'error';
const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 6000,
  warning: 15000,
  error: 15000
};

type ConversationViewerElement = EuphonyConversation | EuphonyCodex;

let initURL = '';

// Check if the URL has query parameters
const urlParams = new URLSearchParams(window.location.search);
let blobPath = urlParams.get('path');

// User can set the index by url hash (e.g., #conversation-12) or url parameter
// (e.g., ?index=12). URL parameter is preferred because it can be sent to the
// server, but internally we use url hash for the scroll.
let conversationIndex = urlParams.get('index');
let urlHash = window.location.hash;
const messageIndexString: string | null = urlParams.get('subindex');
const messageIndex: number | null = messageIndexString
  ? parseInt(messageIndexString)
  : null;
if (conversationIndex !== null) {
  urlHash = `#conversation-${conversationIndex}`;
  window.location.hash = urlHash;
}

/**
 * App element.
 *
 */
@customElement('euphony-app')
export class EuphonyApp extends LitElement {
  //==========================================================================||
  //                              Class Properties                            ||
  //==========================================================================||
  @state()
  allConversationData: Conversation[] = [];

  @state()
  conversationData: Conversation[] = [];

  @state()
  JSONData: Record<string, unknown>[] = [];

  @state()
  codexSessionData: unknown[][] = [];

  @state()
  dataType: DataType = DataType.CONVERSATION;

  @state()
  isLoadingData = false;

  @state()
  curPage = 1;

  @state()
  globalIsShowingMetadata = false;

  @state()
  globalShouldRenderMarkdown = false;

  @state()
  jmespathQuery = '';

  // Focus mode settings
  @state()
  focusModeAuthor: string[] = [];

  @state()
  focusModeRecipient: string[] = [];

  @state()
  focusModeContentType: string[] = [];

  // Nightjar component
  @query('nightjar-toast#toast-euphony')
  toastComponent: NightjarToast | undefined;

  @state()
  toastMessage = '';

  @state()
  toastType: 'success' | 'warning' | 'error' = 'success';

  @query('nightjar-confirm-dialog')
  confirmDialogComponent: NightjarConfirmDialog | undefined;

  @query('nightjar-input-dialog')
  inputDialogComponent: NightjarInputDialog | undefined;

  @query('euphony-search-window')
  searchWindowComponent: EuphonySearchWindow | undefined;

  @query('euphony-token-window')
  tokenWindowComponent: EuphonyTokenWindow | undefined;

  @query('.conversation-grid')
  conversationGridElement: HTMLElement | undefined | null;

  @query('#local-file-input')
  localFileInputElement: HTMLInputElement | undefined;

  apiManager = new APIManager(EUPHONY_API_URL);
  requestWorker = new RequestWorker(EUPHONY_API_URL);
  browserAPIManager = new BrowserAPIManager();

  // Shared state to ensure we prompt only once and queue concurrent requests
  private pendingOpenAIKeyPromise: Promise<string | null> | null = null;

  // Euphony style config
  euphonyStyleConfig: Record<string, string> = {};

  // App style config
  appStyleConfig: Record<string, string> = {};

  // Pagination
  @state()
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
  _totalConversationSize = 0;
  _totalConversationSizeIncludingUnfiltered = 0;

  // Cache setting
  // If user provides no-cache=true or clicks reload without cache, we record the
  // blob path here. It's necessary so we will load without cache when user
  // changes pages / limits / searches.
  noCacheBlobPaths = new Set<string>();

  get totalConversationSize() {
    return this._totalConversationSize;
  }

  get totalPageNum() {
    return Math.ceil(this._totalConversationSize / this.itemsPerPage);
  }

  get totalConversationSizeIncludingUnfiltered() {
    return this._totalConversationSizeIncludingUnfiltered;
  }

  // Editor mode
  @state()
  isEditorMode = false;

  @state()
  selectedConversationIDs = new Set<number>();

  // Frontend only mode
  @state()
  isFrontendOnlyMode =
    import.meta.env.DEV
      ? false
      : (import.meta.env.VITE_EUPHONY_FRONTEND_ONLY as string | undefined) !==
        'false';

  // Tool bar menu
  @state()
  showToolBarMenu = false;

  @state()
  isLoadingFromCache = true;

  @state()
  isLoadingFromClipboard = false;

  @state()
  hasCodexDirectoryAccess = false;

  @state()
  shouldShowAlternateCodexFolderOption = false;

  localCodexBaseDirOverride =
    localStorage.getItem(LOCAL_CODEX_OVERRIDE_STORAGE_KEY) ?? '';

  @state()
  localSessionSearchQuery = '';

  @state()
  localSessionProjectQuery = '';

  @state()
  localSessionFolderQuery = '';

  @state()
  localProjectSummaries: CodexProjectSummaryEntry[] = [];

  @state()
  homeBrowseView: HomeBrowseView = 'sessions';

  @state()
  localQMDQuery = '';

  @state()
  localQMDResults: QMDSearchEntry[] = [];

  @state()
  localQMDScope = '';

  @state()
  localQMDCollection = '';

  @state()
  localQMDMessage = '';

  @state()
  isLoadingQMDResults = false;

  @state()
  localQMDShowAllKeywordMatches = false;

  localSessionFilterDebounceHandle: number | null = null;
  localQMDSearchDebounceHandle: number | null = null;

  // Grid view mode
  @state()
  isGridView = false;

  @state()
  gridViewColumnWidth = 300;
  comparisonColumnWidth = 300;

  // Popups and tooltips
  @state()
  showPreferenceWindow = false;

  @query('#popper-tooltip')
  popperTooltip: HTMLElement | undefined;

  // Scrolling
  @state()
  showScrollTopButton = false;

  // URL manager
  urlManager: URLManager;
  localDataWorker: Worker;
  localDataWorkerRequestCount = 0;
  get localDataWorkerRequestID() {
    return this.localDataWorkerRequestCount++;
  }
  activeLocalDataWorkerRequestID: number | null = null;
  localDataWorkerPendingRequests = new Map<
    number,
    {
      resolve: () => void;
      reject: (reason?: unknown) => void;
    }
  >();

  // Debouncers
  cacheInfoTooltipDebouncer: number | null = null;

  //==========================================================================||
  //                             Lifecycle Methods                            ||
  //==========================================================================||
  constructor() {
    super();

    this.urlManager = new URLManager(this);
    this.localDataWorker = new LocalDataWorkerInline();
    this.localDataWorker.addEventListener(
      'message',
      (e: MessageEvent<LocalDataWorkerMessage>) => {
        this.localDataWorkerMessageHandler(e);
      }
    );

    // Update the configs based on the current URL
    this.urlManager.updateConfigsFromURL();

    // Because we are using web components, we can't directly use anchor links
    // to scroll to different sections. Instead, we will listen to hash changes
    // and scroll to the element with the corresponding ID manually.
    window.addEventListener('hashchange', () => {
      this.hashChanged().then(
        () => {},
        () => {}
      );
    });

    // Allow users to press left and right arrow keys to navigate between pages
    // And use up and down arrow keys to navigate between conversations in the
    // current page
    document.addEventListener('keydown', event => {
      switch (event.key) {
        case 'ArrowLeft':
          // Handle left arrow key press <-
          if (this.curPage > 1) {
            this.updatePageNumber(this.curPage - 1, true).then(
              () => {},
              () => {}
            );
          }
          break;
        case 'ArrowRight':
          // Handle right arrow key press ->
          if (this.curPage + 1 <= this.totalPageNum) {
            this.updatePageNumber(this.curPage + 1, true).then(
              () => {},
              () => {}
            );
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          // Handle up arrow key press ^
          if (urlHash === '') {
            // If there is no hash, we scroll to the first conversation
            urlHash = `#conversation-${(this.curPage - 1) * this.itemsPerPage}`;
          } else {
            const conversationIndex = parseInt(
              urlHash.replace('#conversation-', '')
            );
            if (conversationIndex > (this.curPage - 1) * this.itemsPerPage) {
              urlHash = `#conversation-${conversationIndex - 1}`;
            } else {
              // Loop back to the last conversation in the current page
              urlHash = `#conversation-${Math.min(
                this.totalConversationSize - 1,
                this.curPage * this.itemsPerPage - 1
              )}`;
            }
          }
          history.pushState({}, '', urlHash);
          this.scrollToConversation(urlHash, 'instant');
          break;
        case 'ArrowDown':
          event.preventDefault();
          // Handle down arrow key press
          if (urlHash === '') {
            // If there is no hash, we scroll to the first conversation
            urlHash = `#conversation-${(this.curPage - 1) * this.itemsPerPage}`;
          } else {
            const conversationIndex = parseInt(
              urlHash.replace('#conversation-', '')
            );
            if (
              conversationIndex <
              Math.min(
                this.totalConversationSize - 1,
                this.curPage * this.itemsPerPage - 1
              )
            ) {
              urlHash = `#conversation-${conversationIndex + 1}`;
            } else {
              // Loop back to the first conversation in the current page
              const newIndex = (this.curPage - 1) * this.itemsPerPage;
              urlHash = `#conversation-${newIndex}`;
            }
          }
          this.scrollToConversation(urlHash, 'instant');
          history.pushState({}, '', urlHash);
          break;
        default:
          break;
      }
    });
  }

  disconnectedCallback(): void {
    this.localDataWorker.terminate();
    super.disconnectedCallback();
  }

  /**
   * This method is called when the DOM is added for the first time
   */
  firstUpdated() {
    if (this.isFrontendOnlyMode) {
      this.refreshCodexDirectoryAccess().then(
        () => {},
        () => {}
      );
    }
    this.initData().then(
      () => {},
      () => {}
    );

    // Show the scroll top button when the user scrolls down
    const appElement = this.shadowRoot?.querySelector('.app');
    if (appElement) {
      appElement.addEventListener('scroll', () => {
        const scrollTotal = appElement.scrollHeight - appElement.clientHeight;
        if (
          appElement.scrollTop / scrollTotal > 0.1 ||
          appElement.scrollTop > 100
        ) {
          this.showScrollTopButton = true;
        } else {
          this.showScrollTopButton = false;
        }
      });
    }
  }

  /**
   * This method is called before new DOM is updated and rendered
   * @param changedProperties Property that has been changed
   */
  willUpdate(changedProperties: PropertyValues<this>) {}

  //==========================================================================||
  //                              Custom Methods                              ||
  //==========================================================================||
  async initData() {
    this.isLoadingData = true;

    // If user has specified a hash, we need to jump to that particular page
    // containing the conversation
    if (conversationIndex !== null) {
      const conversationIndexNumber = parseInt(conversationIndex);
      this.curPage =
        Math.floor(conversationIndexNumber / this.itemsPerPage) + 1;
    }

    if (blobPath === null) {
      const didLoadCodexSession = this.isFrontendOnlyMode
        ? await this.tryAutoLoadLocalCodexSession()
        : await this.tryAutoLoadBackendCodexSession();
      if (didLoadCodexSession) {
        this.isLoadingData = false;
        return;
      }

      // User doesn't provide a JSON path in the URL, we use default demo data
      const response = await fetch('examples/euphony-convo-100.jsonl');
      const responseText = await response.text();
      const conversationList: string[] = responseText
        .split('\n')
        .filter(d => d !== '');

      this.dataType = DataType.CONVERSATION;
      this.allConversationData = conversationList.map(item => {
        const parsed = parseConversationJSONString(item);
        if (parsed === null) {
          throw new Error('Failed to parse conversation JSON string');
        }
        return parsed;
      });
      console.log(this.allConversationData);

      // Set all the conversations as selected in editor mode
      if (this.isEditorMode) {
        this.selectedConversationIDs = new Set();
        for (let i = 0; i < conversationList.length; i++) {
          this.selectedConversationIDs.add(i);
        }
      }

      this._totalConversationSize = this.allConversationData.length;

      if (this.curPage > this.totalPageNum) {
        console.error('The conversation index is out of bound.');
        this.curPage = 1;
      }

      this.conversationData = this.allConversationData.slice(
        (this.curPage - 1) * this.itemsPerPage,
        this.curPage * this.itemsPerPage
      );
      this.isLoadingData = false;
    } else {
      initURL = blobPath;

      // Check if we should avoid using cache
      const noCache = urlParams.get('no-cache') === 'true';

      // Track the noCache setting
      if (noCache) {
        this.noCacheBlobPaths.add(initURL);
      }

      // Run a query to get the data
      await this.loadData({
        blobURL: initURL,
        offset: (this.curPage - 1) * this.itemsPerPage,
        limit: this.itemsPerPage,
        showSuccessToast: false,
        noCache,
        jmespathQuery: this.jmespathQuery
      });
    }

    // If the user has provided both urlHash and messageIndex -> scroll to the message
    if (urlHash !== '' && messageIndex !== null) {
      await this.allChildrenUpdateComplete();
      this.scrollToMessage(urlHash, messageIndex);
    } else if (urlHash !== '') {
      // If only urlHash is set -> scroll to the conversation
      await this.allChildrenUpdateComplete();
      this.scrollToConversation(urlHash);
    }
  }

  //==========================================================================||
  //                              Event Handlers                              ||
  //==========================================================================||
  /**
   * Load the JSONL file from the URL provided in the input element
   * @returns
   */
  async loadButtonClicked({ noCache = false }: { noCache?: boolean } = {}) {
    const inputElement = this.shadowRoot?.querySelector('sl-input');
    urlHash = '';

    if (!inputElement) {
      throw new Error('Input element not found');
    }

    // Get the blob URL from the input element
    let blobURL = inputElement.value.trim();
    if (blobURL === '') {
      return;
    }

    // Sometimes the user would copy the euphony url to the input bar, parse
    // the real blob url from the euphony url
    const regex = /[?&]path=([^&#]+)/;
    const match = regex.exec(blobURL);
    if (match?.[1]) {
      blobURL = decodeURIComponent(match[1]);
    }

    // Track the noCache setting
    if (noCache) {
      this.noCacheBlobPaths.add(blobURL);
    }
    if (this.noCacheBlobPaths.has(blobURL)) {
      noCache = true;
    }

    this.curPage = 1;
    const { isLoadDataSuccessful, loadedURL } = await this.loadData({
      blobURL,
      offset: (this.curPage - 1) * this.itemsPerPage,
      limit: this.itemsPerPage,
      noCache
    });

    if (isLoadDataSuccessful) {
      // The urls can include invalid URL characters like '+', we need to
      // encode them before updating the URL
      console.log('loadedURL', loadedURL);
      let query = `?path=${encodeURIComponent(loadedURL)}`;
      if (noCache) {
        query += '&no-cache=true';
      }

      if (this.itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) {
        query += `&limit=${this.itemsPerPage}`;
      }

      if (this.isGridView) {
        query += `&grid=${this.gridViewColumnWidth}`;
      }

      history.pushState({}, '', query);
      blobPath = loadedURL;
      inputElement.value = loadedURL;
    }
  }

  /**
   * Serialize the current data and download it as a JSONL file
   */
  downloadButtonClicked() {
    const elements = this.shadowRoot?.querySelectorAll<EuphonyConversation>(
      'euphony-conversation'
    );
    const jsonStrings: string[] = [];
    if (elements) {
      for (const element of elements) {
        const sharingURL = element.sharingURL;
        let conversationID: number | undefined;
        if (sharingURL) {
          const urlObj = new URL(sharingURL);
          const indexParam = urlObj.searchParams.get('index');
          if (indexParam !== null) {
            conversationID = parseInt(indexParam);
          }
        }
        if (conversationID === undefined) {
          continue;
        }
        if (!this.selectedConversationIDs.has(conversationID)) {
          continue;
        }
        const editedConversation = element.getEditedConversationData();
        if (editedConversation === null) {
          continue;
        }
        jsonStrings.push(JSON.stringify(editedConversation));
      }
    }

    const jsonLString = jsonStrings.join('\n');
    let fileName = 'conversation.jsonl';
    if (blobPath !== null) {
      fileName = blobPath.split('/').pop() ?? 'conversation.jsonl';
    }
    fileName = fileName.replace('.jsonl', '-edited.jsonl');
    downloadText(jsonLString, null, fileName);
  }

  selectAllButtonClicked() {
    if (this.selectedConversationIDs.size !== this.totalConversationSize) {
      // Select all
      this.selectedConversationIDs = new Set();
      for (let i = 0; i < this.totalConversationSize; i++) {
        this.selectedConversationIDs.add(i);
        const conversationElement =
          this.shadowRoot?.querySelector<EuphonyConversation>(
            `#euphony-conversation-${i}`
          );
        if (conversationElement) {
          conversationElement.isConvoMarkedForDeletion = false;
        }
      }
    } else {
      // Unselect all
      this.selectedConversationIDs = new Set();
      for (let i = 0; i < this.totalConversationSize; i++) {
        const conversationElement =
          this.shadowRoot?.querySelector<EuphonyConversation>(
            `#euphony-conversation-${i}`
          );
        if (conversationElement) {
          conversationElement.isConvoMarkedForDeletion = true;
        }
      }
    }
  }

  async updatePageNumber(newPageNumber: number, scrollToTop: boolean) {
    this.curPage = newPageNumber;
    // Reset the hash when the page number is updated
    this.resetHash();

    // Two cases
    // Case 1: We are loading the local demo data. We can simply slice the data
    // Case 2: We are loading the real user's remote data. We need to fetch the
    // the data in the desired page.

    // Case 1: Local demo data
    if (blobPath === null) {
      this.conversationData = this.allConversationData.slice(
        (this.curPage - 1) * this.itemsPerPage,
        this.curPage * this.itemsPerPage
      );
    } else {
      // Case 2: Real user's remote data
      let noCache = false;
      if (this.noCacheBlobPaths.has(blobPath)) {
        noCache = true;
      } else {
        noCache = urlParams.get('no-cache') === 'true';
      }
      await this.loadData({
        blobURL: blobPath,
        offset: (this.curPage - 1) * this.itemsPerPage,
        limit: this.itemsPerPage,
        showSuccessToast: false,
        noCache,
        jmespathQuery: this.jmespathQuery
      });
    }

    if (scrollToTop) {
      this.scrollToTop(0);
    }

    // Update the URL
    this.urlManager.updateURL();
  }

  pageClicked(e: CustomEvent<number>) {
    this.updatePageNumber(e.detail, true).then(
      () => {},
      () => {}
    );
  }

  itemsPerPageChanged(e: CustomEvent<number>) {
    this.itemsPerPage = e.detail;

    // Update the page number based on the new items per page
    this.updatePageNumber(1, true).then(
      () => {},
      () => {}
    );
  }

  async hashChanged() {
    urlHash = window.location.hash;
    conversationIndex = urlParams.get('index');
    if (conversationIndex !== null) {
      urlHash = `#conversation-${conversationIndex}`;
    }

    // Check if we need to update the page number based on the conversation ID
    if (urlHash !== '') {
      const conversationIndex = parseInt(urlHash.replace('#conversation-', ''));
      const newPageNumber =
        Math.floor(conversationIndex / this.itemsPerPage) + 1;

      if (
        newPageNumber !== this.curPage &&
        newPageNumber <= this.totalPageNum
      ) {
        await this.updatePageNumber(newPageNumber, false);
      }
    }

    this.allChildrenUpdateComplete().then(
      () => {
        this.scrollToConversation(urlHash);
      },
      () => {}
    );
  }

  async conversationMetadataButtonToggled(e: CustomEvent<boolean>) {
    const containerElement = this.shadowRoot?.querySelector('.app');
    if (!containerElement) {
      throw Error('App element not found');
    }

    /**
     * Scroll the app element so that the active conversation stays at the same
     * y position after the size shift due to metadata expansion.
     */
    const conversationElement = e.target as EuphonyConversation;
    const originalConversationTop =
      conversationElement.getBoundingClientRect().top;

    this.globalIsShowingMetadata = e.detail;
    await this.allChildrenUpdateComplete();

    const newConversationTop = conversationElement.getBoundingClientRect().top;
    containerElement.scrollTop += newConversationTop - originalConversationTop;

    // Update the URL
    this.urlManager.updateURL();
  }

  async markdownButtonToggled(e: CustomEvent<boolean>) {
    const containerElement = this.shadowRoot?.querySelector('.app');
    if (!containerElement) {
      throw Error('App element not found');
    }

    /**
     * Scroll the app element so that the active conversation stays at the same
     * y position after the size shift due to markdown rendering
     */
    const conversationElement = e.target as EuphonyConversation;
    const originalConversationTop =
      conversationElement.getBoundingClientRect().top;

    this.globalShouldRenderMarkdown = e.detail;
    await this.allChildrenUpdateComplete();

    const newConversationTop = conversationElement.getBoundingClientRect().top;
    containerElement.scrollTop += newConversationTop - originalConversationTop;

    // Update the URL
    this.urlManager.updateURL();
  }

  menuItemClicked(e: CustomEvent<MenuItems>) {
    switch (e.detail) {
      case 'Preferences': {
        this.showPreferenceWindow = true;
        break;
      }
      case 'Choose different Codex folder': {
        this.chooseDifferentCodexFolder().then(
          () => {},
          () => {}
        );
        break;
      }
      case 'Editor mode': {
        this.confirmDialogComponent?.show(
          {
            header: 'No pagination in editor mode',
            message:
              'Editor mode will display all conversations in the JSONL file ' +
              'on a single page, which may cause your browser to slow down ' +
              'or crash if there are too many conversations loaded ' +
              '(e.g., >500).',
            yesButtonText: 'I understand, enter',
            actionKey: 'editor-mode'
          },
          () => {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('editor', 'true');
            currentUrl.searchParams.set('page', '1');
            window.location.href = currentUrl.toString();
          }
        );
        break;
      }
      case 'Leave editor mode': {
        this.confirmDialogComponent?.show(
          {
            header: 'Download the edited JSONL file',
            message:
              'Make sure you have downloaded the edited JSONL file before ' +
              'leaving editor mode. Otherwise, you will lose all your changes.',
            yesButtonText: 'Okay',
            actionKey: 'leave-editor-mode'
          },
          () => {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete('editor');
            currentUrl.searchParams.delete('page');
            window.location.href = currentUrl.toString();
          }
        );
        break;
      }
      case 'Code': {
        window.open('https://github.com/openai/euphony', '_blank');
        break;
      }
      default: {
        console.error('Unknown menu item clicked', e.detail);
        break;
      }
    }
  }

  cacheInfoMouseEnter(e: MouseEvent) {
    if (!this.popperTooltip) {
      throw Error('Popper tooltip not initialized.');
    }

    const anchor = e.currentTarget as HTMLElement;

    if (this.cacheInfoTooltipDebouncer) {
      clearTimeout(this.cacheInfoTooltipDebouncer);
    }

    this.cacheInfoTooltipDebouncer = window.setTimeout(() => {
      // Update the content
      const labelElement = this.popperTooltip!.querySelector('.popper-label');
      labelElement!.textContent =
        'This data is cached for 60 minutes and may be outdated. ' +
        'Click "Load without cache" in the top-right menu to refetch.';

      updatePopperOverlay(this.popperTooltip!, anchor, 'top', true, 7, 300);
      this.popperTooltip!.classList.remove('hidden');
    }, 300);
  }

  cacheInfoMouseLeave(useTransition = true) {
    if (!this.popperTooltip) {
      throw Error('popperTooltip are not initialized yet.');
    }

    if (this.cacheInfoTooltipDebouncer) {
      clearTimeout(this.cacheInfoTooltipDebouncer);
      this.cacheInfoTooltipDebouncer = null;
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

  preferenceWindowMaxMessageHeightChanged(e: CustomEvent<string>) {
    const newHeight = e.detail;
    this.euphonyStyleConfig['--euphony-max-message-height'] = newHeight;
    this.requestUpdate();
  }

  preferenceWindowMessageLabelChanged(e: CustomEvent<MessageLabelSettings>) {
    for (const element of this.getConversationViewerElements()) {
      element.preferenceWindowMessageLabelChanged(e);
    }
  }

  preferenceWindowGridViewColumnWidthChanged(e: CustomEvent<string>) {
    const newWidth = e.detail;
    this.gridViewColumnWidth = parseInt(newWidth);
    this.appStyleConfig['--app-grid-view-column-width'] = newWidth;
    this.requestUpdate();
    this.urlManager.updateURL();
  }

  preferenceWindowComparisonWidthChanged(e: CustomEvent<string>) {
    const newWidth = e.detail;
    this.comparisonColumnWidth = parseInt(newWidth);
    // Pass the CSS variable down to every comparison component via style binding.
    this.euphonyStyleConfig['--comparison-grid-column-width'] = newWidth;
    this.requestUpdate();
  }

  preferenceWindowLayoutChanged(e: CustomEvent<string>) {
    const newLayout = e.detail;
    if (newLayout === 'grid') {
      this.isGridView = true;
    } else if (newLayout === 'list') {
      this.isGridView = false;
    } else {
      throw Error('Unknown layout: ' + newLayout);
    }
    // Update the URL
    this.urlManager.updateURL();
    this.requestUpdate();
  }

  preferenceWindowExpandAllClicked() {
    for (const element of this.getConversationViewerElements()) {
      element.expandBlockContents();
    }
  }

  preferenceWindowCollapseAllClicked() {
    for (const element of this.getConversationViewerElements()) {
      element.collapseBlockContents();
    }
  }

  preferenceWindowTranslateAllClicked() {
    for (const element of this.getConversationViewerElements()) {
      void element.translationButtonClicked();
    }
  }

  preferenceWindowFocusModeSettingsChanged(e: CustomEvent<FocusModeSettings>) {
    const focusModeSettings = e.detail;
    this.focusModeAuthor = [...focusModeSettings.author];
    this.focusModeRecipient = [...focusModeSettings.recipient];
    this.focusModeContentType = [...focusModeSettings.contentType];

    for (const element of this.getConversationViewerElements()) {
      element.preferenceWindowFocusModeSettingsChanged(e);
    }
  }

  async searchWindowQuerySubmitted(e: CustomEvent<string>) {
    if (blobPath === null) {
      throw Error('Blob path is not set');
    }

    const query = e.detail;
    this.curPage = 1;
    let noCache = false;
    if (this.noCacheBlobPaths.has(blobPath)) {
      noCache = true;
    } else {
      noCache = urlParams.get('no-cache') === 'true';
    }

    const { isLoadDataSuccessful, loadDataMessage } = await this.loadData({
      blobURL: blobPath,
      offset: (this.curPage - 1) * this.itemsPerPage,
      limit: this.itemsPerPage,
      jmespathQuery: query,
      noCache: noCache
    });

    if (isLoadDataSuccessful) {
      this.searchWindowComponent?.searchSucceeded();
      // Update the jmespath query and URL
      this.jmespathQuery = query;
      this.urlManager.updateURL();
    } else {
      this.searchWindowComponent?.searchFailed(loadDataMessage);
    }
  }

  /**
   * Show the token window when user clicks on the harmony render button
   * @param e CustomEvent<string> - The custom event containing the conversation string
   */
  harmonyRenderButtonClicked(e: CustomEvent<string>) {
    const conversationString = e.detail;
    if (this.tokenWindowComponent) {
      this.tokenWindowComponent.show(conversationString);
    }
  }

  //==========================================================================||
  //                             Private Helpers                              ||
  //==========================================================================||
  /**
   * Ensures an OpenAI API key is available in localStorage.
   * - If present, resolves immediately with the key.
   * - If absent, shows a single input dialog and returns a shared Promise so
   *   concurrent requests wait for the same user action.
   * - Resolves to null if the user cancels.
   */
  private ensureOpenAIAPIKey(): Promise<string | null> {
    const storedKey = localStorage.getItem('openAIAPIKey');
    if (storedKey) {
      return Promise.resolve(storedKey);
    }

    if (this.pendingOpenAIKeyPromise) {
      return this.pendingOpenAIKeyPromise;
    }

    this.pendingOpenAIKeyPromise = new Promise<string | null>(resolve => {
      this.inputDialogComponent?.show(
        {
          header: 'Enter OpenAI API Key',
          message:
            'To use translation in frontend-only mode, you must provide your own OpenAI API key. The key will only be stored in your browser.',
          yesButtonText: 'Continue'
        },
        (input: string) => {
          // Confirmation action
          // Persist the key and resolve queued requests after a brief delay
          localStorage.setItem('openAIAPIKey', input);
          resolve(input);
          this.pendingOpenAIKeyPromise = null;
        },
        () => {
          // Cancel action
          resolve(null);
          this.pendingOpenAIKeyPromise = null;
        },
        (input: string) => {
          // Input validation action
          // Validate API key before accepting
          return this.browserAPIManager.validateOpenAIAPIKey(input);
        }
      );
    });

    return this.pendingOpenAIKeyPromise;
  }

  async allChildrenUpdateComplete() {
    await this.updateComplete;

    const promises: Promise<void>[] = [];
    const elements = this.shadowRoot?.querySelectorAll<EuphonyConversation>(
      'euphony-conversation'
    );
    if (elements) {
      elements.forEach(element => {
        promises.push(element.allChildrenUpdateComplete());
      });
    }

    await Promise.all(promises);
  }

  scrollToTop = (top = 0, behavior: 'instant' | 'smooth' = 'instant') => {
    this.allChildrenUpdateComplete().then(
      () => {
        const appElement = this.shadowRoot?.querySelector('.app');
        if (appElement) {
          setTimeout(() => {
            appElement.scrollTo({ top, behavior: behavior });
          }, 0);
        }
      },
      () => {}
    );
  };

  scrollToBottom = (behavior: 'instant' | 'smooth' = 'instant') => {
    this.allChildrenUpdateComplete().then(
      () => {
        const appElement = this.shadowRoot?.querySelector('.app');
        if (appElement) {
          setTimeout(() => {
            appElement.scrollTo({
              top: appElement.scrollHeight,
              behavior: behavior
            });
          }, 0);
        }
      },
      () => {}
    );
  };

  scrollToConversation = (
    conversationID: string,
    behavior: 'instant' | 'smooth' = 'smooth'
  ) => {
    const element = this.shadowRoot?.querySelector<HTMLElement>(
      `div${conversationID}`
    );
    const TOP_OFFSET = 20;

    if (element) {
      // Need to skip the header height
      const headerElement = this.shadowRoot?.querySelector('.header');
      const appElement = this.shadowRoot?.querySelector('.app');
      if (!headerElement || !appElement) {
        throw Error('Header element or app element not found');
      }
      const headerHeight = headerElement.getBoundingClientRect().height;
      const elementTop =
        element.getBoundingClientRect().top + appElement.scrollTop;
      const newTop = elementTop - headerHeight - TOP_OFFSET;

      // Focus the element and scroll to it
      element.focus();
      appElement.scrollTo({ top: newTop, behavior: behavior });
    }
  };

  scrollToMessage = (
    conversationID: string,
    messageIndex: number,
    behavior: 'instant' | 'smooth' = 'smooth'
  ) => {
    const element = this.shadowRoot?.querySelector<HTMLElement>(
      `div${conversationID}`
    );
    if (element) {
      const conversationElement = element.querySelector<EuphonyConversation>(
        'euphony-conversation'
      );

      if (!conversationElement) {
        console.error('Conversation element not found');
        return;
      }

      const targetMessageElement =
        conversationElement.getMessageByIndex(messageIndex);

      if (!targetMessageElement) {
        console.error('Target message element not found');
        return;
      }

      const top =
        targetMessageElement.getBoundingClientRect().top +
        window.scrollY -
        HEADER_HEIGHT;

      if (top) {
        this.scrollToTop(top, behavior);
        // Focus the sibling of targetMessageElement (message info)
        const siblingElement =
          targetMessageElement.previousElementSibling as HTMLElement | null;
        if (siblingElement) {
          siblingElement.focus();
        } else {
          console.warn('No sibling element to focus');
        }
      }
    }
  };

  /**
   * Validate and transform the conversations
   * Transform the conversation id from `conversation_id` to `id` if it exists
   *
   * @param conversations - The conversations to validate and transform
   * @returns The validated and transformed conversations
   */
  validateAndTransformConversations = (
    conversations: (string | Conversation | Record<string, unknown>)[]
  ) => {
    const _validateConversation = (conversation: Record<string, unknown>) => {
      return Array.isArray(conversation.messages);
    };

    try {
      const allValid: boolean[] = [];
      for (const [i, conversation] of conversations.entries()) {
        if (typeof conversation === 'string') {
          const conversationData = JSON.parse(conversation) as Record<
            string,
            unknown
          >;
          let newItem = conversation;

          // Special handling for chatgpt web's harmony dialect, where people
          // use `conversation_id` instead of `id`
          if (
            conversationData.conversation_id !== undefined &&
            conversationData.id === undefined
          ) {
            conversationData.id = conversationData.conversation_id;
            newItem = JSON.stringify(conversationData);
          }

          conversations[i] = newItem;
          allValid.push(_validateConversation(conversationData));
        } else {
          const conversationData = conversation as unknown as Record<
            string,
            unknown
          >;

          // Special handling for a Harmony dialect that uses
          // `conversation_id` instead of `id`.
          if (
            conversationData.conversation_id !== undefined &&
            conversationData.id === undefined
          ) {
            conversationData.id = conversationData.conversation_id;
          }

          conversations[i] = conversationData;
          allValid.push(_validateConversation(conversationData));
        }
      }

      return allValid.every(valid => valid);
    } catch (error) {
      console.error('Bad conversation format', error);
      return false;
    }
  };

  validateConversation = (
    conversation: string | Conversation | Record<string, unknown>
  ) => {
    const _validateConversation = (conversation: Record<string, unknown>) => {
      return Array.isArray(conversation.messages);
    };

    try {
      if (typeof conversation === 'string') {
        const conversationData = JSON.parse(conversation) as Record<
          string,
          unknown
        >;
        return _validateConversation(conversationData);
      } else {
        const conversationData = conversation as unknown as Record<
          string,
          unknown
        >;
        return _validateConversation(conversationData);
      }
    } catch (error) {
      console.error('Bad conversation format', error);
      return false;
    }
  };

  validateComparison = (
    comparison: string | Conversation | Record<string, unknown>
  ) => {
    const _validateComparison = (comparison: Record<string, unknown>) => {
      return (
        comparison.conversation !== undefined &&
        comparison.completions !== undefined
      );
    };

    try {
      if (typeof comparison === 'string') {
        const comparisonData = JSON.parse(comparison) as Record<
          string,
          unknown
        >;
        return _validateComparison(comparisonData);
      } else {
        const comparisonData = comparison as unknown as Record<string, unknown>;
        return _validateComparison(comparisonData);
      }
    } catch (error) {
      console.error('Bad comparison format', error);
      return false;
    }
  };

  loadDataFromText = (
    sourceText: string,
    sourceName: 'clipboard' | 'file'
  ) => {
    this.curPage = 1;
    this.resetHash();
    const requestID = this.localDataWorkerRequestID;
    this.activeLocalDataWorkerRequestID = requestID;

    return new Promise<void>((resolve, reject) => {
      this.localDataWorkerPendingRequests.set(requestID, { resolve, reject });
      const message: LocalDataWorkerMessage = {
        command: 'startParseData',
        payload: {
          requestID,
          sourceName,
          sourceText
        }
      };
      this.localDataWorker.postMessage(message);
    });
  };

  loadDataFromFile = (sourceFile: File) => {
    this.curPage = 1;
    this.resetHash();
    const requestID = this.localDataWorkerRequestID;
    this.activeLocalDataWorkerRequestID = requestID;

    return new Promise<void>((resolve, reject) => {
      this.localDataWorkerPendingRequests.set(requestID, { resolve, reject });
      const message: LocalDataWorkerMessage = {
        command: 'startParseData',
        payload: {
          requestID,
          sourceName: 'file',
          sourceFile
        }
      };
      this.localDataWorker.postMessage(message);
    });
  };

  localDataWorkerMessageHandler(e: MessageEvent<LocalDataWorkerMessage>) {
    switch (e.data.command) {
      case 'finishParseData': {
        const { requestID, sourceName, dataType } = e.data.payload;
        const pendingRequest =
          this.localDataWorkerPendingRequests.get(requestID);
        this.localDataWorkerPendingRequests.delete(requestID);
        if (requestID !== this.activeLocalDataWorkerRequestID) {
          pendingRequest?.resolve();
          break;
        }
        blobPath = null;
        this.isLoadingData = false;

        this.codexSessionData = [];
        this.allConversationData = [];
        this.conversationData = [];
        this.JSONData = [];

        if (dataType === 'codex') {
          this.codexSessionData = [e.data.payload.codexSessionData];
          this.selectedConversationIDs = new Set();
          this.dataType = DataType.CODEX;
          this._totalConversationSize = 1;
          this._totalConversationSizeIncludingUnfiltered = 1;
          this.isLoadingFromCache = false;
          this.isLoadingFromClipboard = true;

          this.toastMessage = `Codex session loaded successfully from ${sourceName}`;
          this.toastType = 'success';
        } else if (dataType === 'json') {
          this.JSONData = e.data.payload.jsonData;
          this.dataType = DataType.JSON;
          this._totalConversationSize = this.JSONData.length;
          this._totalConversationSizeIncludingUnfiltered = this.JSONData.length;
          this.isLoadingFromCache = false;
          this.isLoadingFromClipboard = true;

          this.toastMessage =
            'Failed to find harmony-formatted data. Render JSON instead.';
          this.toastType = 'warning';
        } else {
          const conversationData = e.data.payload.conversationData;
          this._totalConversationSize = conversationData.length;
          this._totalConversationSizeIncludingUnfiltered =
            conversationData.length;

          if (this.isEditorMode) {
            this.selectedConversationIDs = new Set();
            for (let i = 0; i < conversationData.length; i++) {
              this.selectedConversationIDs.add(i);
            }
          }

          this.allConversationData = conversationData;
          this.conversationData = this.isEditorMode
            ? conversationData
            : conversationData.slice(
                (this.curPage - 1) * this.itemsPerPage,
                this.curPage * this.itemsPerPage
              );
          this.dataType = DataType.CONVERSATION;
          this.isLoadingFromCache = false;
          this.isLoadingFromClipboard = true;

          this.toastMessage = `Data loaded successfully from ${sourceName}`;
          this.toastType = 'success';
        }

        this.toastComponent?.show();
        pendingRequest?.resolve();
        break;
      }

      case 'error': {
        const { requestID, sourceName, message } = e.data.payload;
        const pendingRequest =
          this.localDataWorkerPendingRequests.get(requestID);
        this.localDataWorkerPendingRequests.delete(requestID);
        if (requestID !== this.activeLocalDataWorkerRequestID) {
          pendingRequest?.reject(new Error(message));
          break;
        }
        this.isLoadingData = false;

        this.toastMessage = `Failed to read any JSON or JSONL data from your ${sourceName}. Please double check and try again.\n\n${message}`;
        this.toastType = 'error';
        this.toastComponent?.show();
        pendingRequest?.reject(new Error(message));
        break;
      }

      default: {
        console.error('Unknown local data worker message', e.data.command);
        break;
      }
    }
  }

  localFileInputChanged(e: Event) {
    const inputElement = e.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    if (!file) {
      return;
    }

    this.isLoadingData = true;
    this.loadDataFromFile(file)
      .catch((error: unknown) => {
        this.toastMessage = `Failed to read local file.\n\n${error}`;
        this.toastType = 'error';
        this.toastComponent?.show();
        this.isLoadingData = false;
      })
      .finally(() => {
        inputElement.value = '';
      });
  }

  async refreshCodexDirectoryAccess() {
    if (!this.isFrontendOnlyMode) {
      this.hasCodexDirectoryAccess = true;
      return true;
    }

    if (!isFileSystemAccessSupported()) {
      this.hasCodexDirectoryAccess = false;
      return false;
    }

    const handle = await getStoredCodexDirectoryHandle();
    if (!handle) {
      this.hasCodexDirectoryAccess = false;
      return false;
    }

    const hasPermission = await ensureDirectoryPermission(handle, false);
    this.hasCodexDirectoryAccess = hasPermission;
    return hasPermission;
  }

  buildLocalCodexBlobURL(
    fileType: 'latest-session' | 'session-index' | 'prompt-history'
  ) {
    const queryParams = new URLSearchParams();
    const baseDir = this.localCodexBaseDirOverride.trim();
    if (baseDir !== '') {
      queryParams.set('baseDir', baseDir);
    }

    const queryString = queryParams.toString();
    return `local-codex:///${fileType}${queryString ? `?${queryString}` : ''}`;
  }

  buildLocalCodexSessionListBlobURL() {
    const queryParams = new URLSearchParams();
    const baseDir = this.localCodexBaseDirOverride.trim();
    if (baseDir !== '') {
      queryParams.set('baseDir', baseDir);
    }
    if (this.localSessionSearchQuery.trim() !== '') {
      queryParams.set('searchQuery', this.localSessionSearchQuery.trim());
    }
    if (this.localSessionProjectQuery.trim() !== '') {
      queryParams.set('projectQuery', this.localSessionProjectQuery.trim());
    }
    if (this.localSessionFolderQuery.trim() !== '') {
      queryParams.set('folderQuery', this.localSessionFolderQuery.trim());
    }

    const queryString = queryParams.toString();
    return `local-codex:///session-list${queryString ? `?${queryString}` : ''}`;
  }

  buildLocalCodexProjectListBlobURL() {
    const queryParams = new URLSearchParams();
    const baseDir = this.localCodexBaseDirOverride.trim();
    if (baseDir !== '') {
      queryParams.set('baseDir', baseDir);
    }

    const queryString = queryParams.toString();
    return `local-codex:///session-projects${queryString ? `?${queryString}` : ''}`;
  }

  syncLocalSessionFiltersFromBlobURL(blobURL: string) {
    if (!blobURL.startsWith('local-codex:///session-list')) {
      return;
    }

    const parsed = new URL(blobURL);
    this.localSessionSearchQuery = parsed.searchParams.get('searchQuery') ?? '';
    this.localSessionProjectQuery =
      parsed.searchParams.get('projectQuery') ?? '';
    this.localSessionFolderQuery = parsed.searchParams.get('folderQuery') ?? '';
  }

  async connectCodexFolder(showAlternateFolderOption: boolean) {
    if (!isFileSystemAccessSupported()) {
      this.toastMessage =
        'Your browser does not support the File System Access API.';
      this.toastType = 'error';
      this.toastComponent?.show();
      return;
    }

    const handle = await connectCodexDirectory();
    const hasPermission = await ensureDirectoryPermission(handle, true);
    this.hasCodexDirectoryAccess = hasPermission;
    this.shouldShowAlternateCodexFolderOption = showAlternateFolderOption;

    if (!hasPermission) {
      this.shouldShowAlternateCodexFolderOption = true;
      this.toastMessage =
        'Connected the folder, but browser read permission was not granted.';
      this.toastType = 'warning';
      this.toastComponent?.show();
      return;
    }

    this.toastMessage =
      `Codex folder connected. If this was not ${DEFAULT_CODEX_DIRECTORY}, use the menu to choose a different folder.`;
    this.toastType = 'success';
    this.toastComponent?.show();
  }

  async useDefaultCodexFolder() {
    if (this.isFrontendOnlyMode) {
      await this.connectCodexFolder(false);
      return;
    }

    this.localCodexBaseDirOverride = '';
    localStorage.removeItem(LOCAL_CODEX_OVERRIDE_STORAGE_KEY);
    this.shouldShowAlternateCodexFolderOption = false;
    await this.openLocalSessionList();
  }

  private promptForCodexBaseDir(): Promise<string | null> {
    return new Promise(resolve => {
      this.inputDialogComponent?.show(
        {
          header: 'Enter Codex history folder',
          message:
            'The default folder did not work. Enter a different local Codex base directory, for example /Users/your-name/.codex.',
          yesButtonText: 'Use folder',
          errorMessage: 'Please enter an absolute path.'
        },
        (input: string) => {
          resolve(input.trim());
        },
        () => {
          resolve(null);
        },
        input => input.trim().startsWith('/')
      );
    });
  }

  async chooseDifferentCodexFolder() {
    if (this.isFrontendOnlyMode) {
      await this.connectCodexFolder(true);
      return;
    }

    const input = await this.promptForCodexBaseDir();
    if (!input) {
      return;
    }

    this.localCodexBaseDirOverride = input;
    localStorage.setItem(LOCAL_CODEX_OVERRIDE_STORAGE_KEY, input);
    this.shouldShowAlternateCodexFolderOption = true;
    await this.openLocalSessionList();
  }

  async openLocalSessionList() {
    this.homeBrowseView = 'sessions';
    const blobURL = this.buildLocalCodexSessionListBlobURL();
    const { isLoadDataSuccessful, loadDataMessage } = await this.loadData({
      blobURL,
      offset: 0,
      limit: this.itemsPerPage,
      jmespathQuery: this.jmespathQuery
    });

    if (!isLoadDataSuccessful) {
      this.hasCodexDirectoryAccess = false;
      this.shouldShowAlternateCodexFolderOption = true;
      this.toastMessage =
        loadDataMessage ||
        `Failed to load Codex history from ${this.localCodexBaseDirOverride || DEFAULT_CODEX_DIRECTORY}.`;
      this.toastType = 'error';
      this.toastComponent?.show();
    } else {
      this.hasCodexDirectoryAccess = true;
      this.shouldShowAlternateCodexFolderOption =
        this.localCodexBaseDirOverride.trim() !== '';
      await this.refreshLocalProjectSummaries();
    }
  }

  async openConnectedCodexFile(
    fileType: 'latest-session' | 'session-index' | 'prompt-history'
  ) {
    if (!this.isFrontendOnlyMode) {
      const blobURL = this.buildLocalCodexBlobURL(fileType);
      const { isLoadDataSuccessful, loadDataMessage } = await this.loadData({
        blobURL,
        offset: 0,
        limit: this.itemsPerPage,
        jmespathQuery: this.jmespathQuery
      });

      if (!isLoadDataSuccessful) {
        this.hasCodexDirectoryAccess = false;
        this.shouldShowAlternateCodexFolderOption = true;
        this.toastMessage =
          loadDataMessage ||
          `Failed to load Codex history from ${this.localCodexBaseDirOverride || DEFAULT_CODEX_DIRECTORY}.`;
        this.toastType = 'error';
        this.toastComponent?.show();
      } else {
        this.hasCodexDirectoryAccess = true;
        this.shouldShowAlternateCodexFolderOption =
          this.localCodexBaseDirOverride.trim() !== '';
        await this.refreshLocalProjectSummaries();
      }
      return;
    }

    if (!isFileSystemAccessSupported()) {
      this.toastMessage =
        'Your browser does not support the File System Access API.';
      this.toastType = 'error';
      this.toastComponent?.show();
      return;
    }

    let handle = await getStoredCodexDirectoryHandle();
    if (!handle) {
      handle = await connectCodexDirectory();
    }
    if (!handle) {
      return;
    }

    const hasPermission = await ensureDirectoryPermission(handle, true);
    this.hasCodexDirectoryAccess = hasPermission;
    if (!hasPermission) {
      this.shouldShowAlternateCodexFolderOption = true;
      this.toastMessage = 'Euphony needs read access to the selected Codex folder.';
      this.toastType = 'error';
      this.toastComponent?.show();
      return;
    }

    let fileHandle: FileSystemFileHandle | null = null;
    if (fileType === 'latest-session') {
      fileHandle = await getLatestArchivedCodexFile(handle);
    } else if (fileType === 'session-index') {
      fileHandle = await getCodexIndexFile(handle);
    } else {
      fileHandle = await getCodexHistoryFile(handle);
    }

    if (!fileHandle) {
      this.shouldShowAlternateCodexFolderOption = true;
      this.toastMessage =
        'The requested Codex file was not found in the connected folder.';
      this.toastType = 'error';
      this.toastComponent?.show();
      return;
    }

    this.isLoadingData = true;
    const file = await fileHandle.getFile();
    await this.loadDataFromFile(file).catch((error: unknown) => {
      this.toastMessage = `Failed to read local file.\n\n${error}`;
      this.toastType = 'error';
      this.toastComponent?.show();
      this.isLoadingData = false;
    });
  }

  async tryAutoLoadLocalCodexSession() {
    if (!isFileSystemAccessSupported()) {
      return false;
    }

    const handle = await getStoredCodexDirectoryHandle();
    if (!handle) {
      return false;
    }

    const hasPermission = await ensureDirectoryPermission(handle, false);
    this.hasCodexDirectoryAccess = hasPermission;
    if (!hasPermission) {
      return false;
    }

    const latestFileHandle = await getLatestArchivedCodexFile(handle);
    if (!latestFileHandle) {
      return false;
    }

    const latestFile = await latestFileHandle.getFile();
    await this.loadDataFromFile(latestFile);
    return true;
  }

  async tryAutoLoadBackendCodexSession() {
    const { isLoadDataSuccessful } = await this.loadData({
      blobURL: this.buildLocalCodexSessionListBlobURL(),
      offset: 0,
      limit: this.itemsPerPage,
      showSuccessToast: false,
      jmespathQuery: this.jmespathQuery
    });

    if (!isLoadDataSuccessful) {
      this.shouldShowAlternateCodexFolderOption = true;
      return false;
    }

    this.hasCodexDirectoryAccess = true;
    return true;
  }

  loadData = async ({
    blobURL,
    offset,
    limit,
    showSuccessToast = true,
    noCache = false,
    jmespathQuery = ''
  }: {
    blobURL: string;
    offset: number;
    limit: number;
    showSuccessToast?: boolean;
    noCache?: boolean;
    jmespathQuery?: string;
  }): Promise<{
    isLoadDataSuccessful: boolean;
    loadDataMessage: string;
    loadedURL: string;
  }> => {
    this.isLoadingData = true;
    this.isLoadingFromClipboard = false;
    this.codexSessionData = [];
    let loadedURL = blobURL;
    const toastMessages = [];

    try {
      const curAPIManager = this.isFrontendOnlyMode
        ? this.browserAPIManager
        : this.apiManager;

      const { data, total, matchedCount, resolvedURL } =
        await curAPIManager.getJSONL({
          blobURL,
          offset,
          limit,
          noCache,
          jmespathQuery
        });

      loadedURL = resolvedURL;
      this.syncLocalSessionFiltersFromBlobURL(blobURL);

      if (data.length === 0) {
        this.isLoadingData = false;
        toastMessages.push('No data found.');
        return {
          isLoadDataSuccessful: false,
          loadDataMessage: toastMessages.join('\n\n'),
          loadedURL: loadedURL
        };
      }

      // We know the data is successfully loaded, so we update the URL state
      // early before any follow-up rendering or pagination work.
      blobPath = blobURL;

      // Codex sessions are JSONL event streams, not Harmony conversations.
      // Fetch the full event stream if the first page was truncated and route
      // the result to the Codex renderer.
      if (isCodexSessionJSONL(data as unknown[])) {
        let codexSessionEvents = data as unknown[];
        if (total > data.length) {
          const fullResponse = await curAPIManager.getJSONL({
            blobURL,
            offset: 0,
            limit: total,
            noCache,
            jmespathQuery
          });
          codexSessionEvents = fullResponse.data as unknown[];
        }

        this.codexSessionData = [codexSessionEvents];
        this.allConversationData = [];
        this.conversationData = [];
        this.JSONData = [];
        this.selectedConversationIDs = new Set();
        this.dataType = DataType.CODEX;
        this._totalConversationSize = 1;
        this._totalConversationSizeIncludingUnfiltered = 1;
        this.isLoadingData = false;
        this.isLoadingFromCache = !noCache;

        if (urlHash === '') {
          this.scrollToTop(0);
        }

        if (showSuccessToast) {
          toastMessages.push('Codex session loaded successfully');
          this.toastMessage = toastMessages.join('\n\n');
          this.toastType = 'success';
          if (this.toastComponent) {
            this.toastComponent.show();
          }
        }

        return {
          isLoadDataSuccessful: true,
          loadDataMessage: toastMessages.join('\n\n'),
          loadedURL: loadedURL
        };
      }

      // Check if the data is valid
      if (!this.validateConversation(data[0])) {
        const typedData = data as Record<string, unknown>[];
        this.JSONData = typedData;
        this.dataType = DataType.JSON;
        this._totalConversationSize = matchedCount;
        this._totalConversationSizeIncludingUnfiltered = total;

        if (this.isCodexSessionSummaryList(typedData)) {
          await this.refreshLocalProjectSummaries();
        } else {
          this.localProjectSummaries = [];
        }

        this.isLoadingData = false;

        if (urlHash === '') {
          this.scrollToTop(0);
        }

        if (
          this.isCodexSessionIndexList(typedData) ||
          this.isCodexSessionSummaryList(typedData)
        ) {
          if (showSuccessToast) {
            toastMessages.push('Codex session browser loaded successfully');
            this.toastMessage = toastMessages.join('\n\n');
            this.toastType = 'success';
            if (this.toastComponent) {
              this.toastComponent.show();
            }
          }
          toastMessages.push(`Loaded ${matchedCount} sessions`);
        } else {
          // If data is invalid conversation, we render it as JSON
          toastMessages.push(
            'Failed to find harmony-formatted data. Render JSON instead.'
          );
          this.toastMessage = toastMessages.join('\n\n');
          this.toastType = 'warning';
          if (this.toastComponent) {
            this.toastComponent.show();
          }

          toastMessages.push(`Loaded ${matchedCount} items`);
        }
        return {
          isLoadDataSuccessful: true,
          loadDataMessage: toastMessages.join('\n\n'),
          loadedURL: loadedURL
        };
      }

      this._totalConversationSize = matchedCount;
      this._totalConversationSizeIncludingUnfiltered = total;

      // Set all the conversations as selected in editor mode
      if (this.isEditorMode) {
        this.selectedConversationIDs = new Set();
        for (let i = 0; i < data.length; i++) {
          this.selectedConversationIDs.add(i);
        }
      }

      // Conversation
      // - Conversation string
      if (typeof data[0] === 'string') {
        const newData: Conversation[] = data.map(item => {
          if (typeof item === 'string') {
            const parsed = parseConversationJSONString(item);
            if (parsed === null) {
              throw new Error('Failed to parse conversation JSON string');
            }
            return parsed;
          }
          return item as Conversation;
        });
        this.allConversationData = newData;
        this.conversationData = newData;
        this.dataType = DataType.CONVERSATION;
      } else {
        // - Conversation object
        const typedData = data as Conversation[];
        this.allConversationData = typedData;
        this.conversationData = typedData;
        this.dataType = DataType.CONVERSATION;
      }

      this.isLoadingData = false;

      // If there is no hash in the url, scroll to top after loading data
      if (urlHash === '') {
        this.scrollToTop(0);
      }

      console.log(`Loaded ${limit} conversations`);

      // Update the cache info
      this.isLoadingFromCache = !noCache;

      // Show a successful toast
      if (showSuccessToast) {
        toastMessages.push('Data loaded successfully');
        this.toastMessage = toastMessages.join('\n\n');
        this.toastType = 'success';
        if (this.toastComponent) {
          this.toastComponent.show();
        }
      }
      return {
        isLoadDataSuccessful: true,
        loadDataMessage: toastMessages.join('\n\n'),
        loadedURL: loadedURL
      };
    } catch (error) {
      console.error('Error loading data', error);
      // Show a failure toast
      let errorMessage = `Failed to load the data.\n\n${error}`;
      if (blobURL.includes(' ')) {
        errorMessage +=
          '\n\nMake sure the URL has no spaces or invalid characters.';
      } else {
        errorMessage +=
          '\n\nMake sure the URL is correct and publicly reachable.';
      }

      toastMessages.push(errorMessage);
      this.toastMessage = toastMessages.join('\n\n');
      this.toastType = 'error';
      if (this.toastComponent) {
        this.toastComponent.show();
      }

      this.isLoadingData = false;
      return {
        isLoadDataSuccessful: false,
        loadDataMessage: toastMessages.join('\n\n'),
        loadedURL: loadedURL
      };
    }
  };

  resetFilter = async (filter: 'jmespath' | 'concept') => {
    if (blobPath === null) {
      throw Error('Blob path is not set');
    }

    if (filter === 'jmespath') {
      this.jmespathQuery = '';
    }
    this.curPage = 1;
    let noCache = false;
    if (this.noCacheBlobPaths.has(blobPath)) {
      noCache = true;
    } else {
      noCache = urlParams.get('no-cache') === 'true';
    }

    await this.loadData({
      blobURL: blobPath,
      offset: (this.curPage - 1) * this.itemsPerPage,
      limit: this.itemsPerPage,
      showSuccessToast: false,
      noCache,
      jmespathQuery: this.jmespathQuery
    });

    this.urlManager.updateURL();
  };

  resetHash = (shouldBlurActiveElement = true) => {
    // Remove the hash from the URL but keep the search parameters
    const url = new URL(window.location.href);
    url.hash = '';
    urlHash = '';
    url.searchParams.delete('index');
    conversationIndex = null;
    history.pushState({}, '', url.toString());

    // Remove the focus from the active element
    if (shouldBlurActiveElement && this.shadowRoot?.activeElement) {
      (this.shadowRoot.activeElement as HTMLElement).blur();
    }
  };

  buildEuphonyStyle(styleConfig: Record<string, string>) {
    let style = '';
    for (const [key, value] of Object.entries(styleConfig)) {
      style += `${key}: ${value};`;
    }
    return style;
  }

  isCodexSessionIndexList(data: Record<string, unknown>[]) {
    return data.length > 0 && data.every(item => isCodexSessionIndexEntry(item));
  }

  isCodexSessionSummaryList(data: Record<string, unknown>[]) {
    return data.length > 0 && data.every(item => isCodexSessionSummaryEntry(item));
  }

  formatCodexUpdatedAt(updatedAt?: string) {
    if (!updatedAt) {
      return 'Unknown update time';
    }

    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) {
      return updatedAt;
    }

    return date.toLocaleString();
  }

  formatCodexSessionLocation(
    session: Record<string, unknown> & CodexSessionSummaryEntry
  ) {
    if (session.folder_path) {
      const parts = session.folder_path.split('/').filter(Boolean);
      return parts.at(-1) ?? session.folder_path;
    }

    if (session.project_name) {
      return session.project_name;
    }

    return '';
  }

  formatQMDResultPath(file: string, result?: QMDSearchEntry) {
    if (result?.folder_path && result.folder_path.trim() !== '') {
      return result.folder_path;
    }
    if (result?.project_name && result.project_name.trim() !== '') {
      return result.project_name;
    }
    if (result?.source_kind && result.source_kind.trim() !== '') {
      return result.source_kind;
    }
    return file.replace(/^qmd:\/\/[^/]+\//, '');
  }

  formatProjectCardPath(path: string) {
    const parts = path.split('/').filter(Boolean);
    return parts.at(-1) ?? path;
  }

  formatSessionDisplayTitle(title?: string | null) {
    const raw = (title ?? '').trim();
    if (raw === '') {
      return 'Untitled session';
    }

    return raw
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  formatQMDResultSnippet(snippet: string) {
    const cleaned = snippet
      .replace(/^@@.*$/gm, '')
      .replace(/\r/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();

    if (cleaned === '') {
      return 'No preview available.';
    }

    return cleaned;
  }

  formatQMDMatchTypes(result: QMDSearchEntry) {
    const types = Array.isArray(result.match_types) ? result.match_types : [];
    if (types.length === 0) {
      return '';
    }

    const ordered = ['semantic', 'keyword'].filter(type => types.includes(type));
    return ordered.join(' + ');
  }

  getLocalSessionMatchSummary() {
    const parts: string[] = [];

    if (this.localSessionSearchQuery.trim() !== '') {
      parts.push(
        `Text matches title, first prompt, project, or folder for "${this.localSessionSearchQuery.trim()}"`
      );
    }

    if (this.localSessionProjectQuery.trim() !== '') {
      parts.push(`Project matches "${this.localSessionProjectQuery.trim()}"`);
    }

    if (this.localSessionFolderQuery.trim() !== '') {
      parts.push(`Folder matches "${this.localSessionFolderQuery.trim()}"`);
    }

    return parts;
  }

  getActiveQMDScope() {
    return {
      projectName: this.localSessionProjectQuery.trim(),
      folderHint: this.localSessionFolderQuery.trim()
    };
  }

  get isQMDSearchMode() {
    return this.localQMDQuery.trim() !== '';
  }

  get isLocalSessionBrowserView() {
    return (
      this.dataType === DataType.JSON &&
      this.isCodexSessionSummaryList(this.JSONData) &&
      !this.isEditorMode
    );
  }

  get isCodexSessionDetailView() {
    return this.dataType === DataType.CODEX && this.codexSessionData.length > 0;
  }

  get visibleProjectSummaries() {
    const sessionTextFilter = this.localSessionSearchQuery.trim().toLowerCase();
    const folderFilter = this.localSessionFolderQuery.trim().toLowerCase();

    return this.localProjectSummaries.filter(project => {
      const matchesText =
        sessionTextFilter === '' ||
        project.project_name.toLowerCase().includes(sessionTextFilter) ||
        project.folder_path.toLowerCase().includes(sessionTextFilter);
      const matchesFolder =
        folderFilter === '' ||
        project.folder_path.toLowerCase().includes(folderFilter);
      return matchesText && matchesFolder;
    });
  }

  async openHomeBrowseView(view: HomeBrowseView) {
    if (!this.isLocalSessionBrowserView) {
      await this.openLocalSessionList();
    }
    this.homeBrowseView = view;
  }

  async openProjectSessions(projectName: string, folderPath?: string) {
    this.homeBrowseView = 'sessions';
    this.localSessionProjectQuery = projectName;
    this.localSessionFolderQuery = folderPath ?? '';
    await this.applyLocalSessionFilters();
  }

  async runLocalQMDSearch() {
    const query = this.localQMDQuery.trim();
    if (query === '') {
      this.localQMDResults = [];
      this.localQMDMessage = '';
      this.localQMDScope = '';
      this.localQMDCollection = '';
      return;
    }

    this.isLoadingQMDResults = true;
    const { projectName, folderHint } = this.getActiveQMDScope();

    try {
      const response = await this.apiManager.qmdSearch({
        query,
        baseDir:
          this.localCodexBaseDirOverride.trim() !== ''
            ? this.localCodexBaseDirOverride.trim()
            : undefined,
        projectName: projectName || undefined,
        folderHint: folderHint || undefined,
        limit: 8,
        semantic: !this.localQMDShowAllKeywordMatches,
        allMatches: this.localQMDShowAllKeywordMatches
      });
      this.localQMDResults = response.results;
      this.localQMDScope = response.scope;
      this.localQMDCollection = response.collection;
      this.localQMDMessage =
        response.results.length === 0
          ? this.localQMDShowAllKeywordMatches
            ? 'No keyword Codex session matches found.'
            : 'No hybrid Codex session matches found.'
          : this.localQMDShowAllKeywordMatches
            ? `${response.total} keyword Codex session matches`
            : `${response.total} hybrid Codex session matches`;
    } catch (error) {
      this.localQMDResults = [];
      this.localQMDScope = '';
      this.localQMDCollection = '';
      this.localQMDMessage = `qmd search failed: ${error}`;
    } finally {
      this.isLoadingQMDResults = false;
    }
  }

  queueLocalQMDSearch() {
    if (this.localQMDSearchDebounceHandle !== null) {
      window.clearTimeout(this.localQMDSearchDebounceHandle);
    }

    this.localQMDSearchDebounceHandle = window.setTimeout(() => {
      this.localQMDSearchDebounceHandle = null;
      this.runLocalQMDSearch().then(
        () => {},
        () => {}
      );
    }, 250);
  }

  async applyLocalSessionFilters() {
    this.curPage = 1;
    this.resetHash(false);
    this.localQMDResults = [];
    this.localQMDMessage = '';
    this.localQMDScope = '';
    this.localQMDCollection = '';
    await this.loadData({
      blobURL: this.buildLocalCodexSessionListBlobURL(),
      offset: 0,
      limit: this.itemsPerPage,
      showSuccessToast: false,
      jmespathQuery: this.jmespathQuery
    });
    this.urlManager.updateURL();

    if (this.localQMDQuery.trim() !== '') {
      this.queueLocalQMDSearch();
    }
  }

  queueLocalSessionFilterApply() {
    if (this.localSessionFilterDebounceHandle !== null) {
      window.clearTimeout(this.localSessionFilterDebounceHandle);
    }

    this.localSessionFilterDebounceHandle = window.setTimeout(() => {
      this.localSessionFilterDebounceHandle = null;
      this.applyLocalSessionFilters().then(
        () => {},
        () => {}
      );
    }, 200);
  }

  async refreshLocalProjectSummaries() {
    if (this.isFrontendOnlyMode) {
      this.localProjectSummaries = [];
      return;
    }

    try {
      const response = await this.apiManager.getJSONL({
        blobURL: this.buildLocalCodexProjectListBlobURL(),
        offset: 0,
        limit: 200,
        noCache: false,
        jmespathQuery: ''
      });
      const data = response.data as Record<string, unknown>[];
      this.localProjectSummaries = data.filter(isCodexProjectSummaryEntry);
    } catch (_error) {
      this.localProjectSummaries = [];
    }
  }

  //==========================================================================||
  //                           Templates and Styles                           ||
  //==========================================================================||
  getConversationViewerElements(): ConversationViewerElement[] {
    return [
      ...(this.shadowRoot?.querySelectorAll<EuphonyConversation>(
        'euphony-conversation'
      ) ?? []),
      ...(this.shadowRoot?.querySelectorAll<EuphonyCodex>('euphony-codex') ??
        [])
    ];
  }

  render() {
    // Build the conversation components
    let conversationsTemplate = html``;

    let conversationList:
      | Conversation[]
      | Record<string, unknown>[]
      | unknown[][];

    // Use a switch statement to set conversationList based on dataType
    switch (this.dataType) {
      case DataType.CONVERSATION:
        conversationList = this.conversationData;
        break;
      case DataType.CODEX:
        conversationList = this.codexSessionData;
        break;
      case DataType.JSON:
        conversationList = this.JSONData;
        break;
    }

    for (const [i, conversation] of conversationList.entries()) {
      const curID = (this.curPage - 1) * this.itemsPerPage + i;
      const url = this.urlManager.getShareURL(curID, blobPath);
      const isSessionSummary =
        this.dataType === DataType.JSON &&
        isCodexSessionSummaryEntry(conversation as Record<string, unknown>);

      let euphonyTemplate = html``;

      if (this.dataType === DataType.CONVERSATION) {
        // Handle the case where the conversation is a string
        // (double string encoding during JSON serialization)
        let curConversation: Conversation | null = null;
        curConversation = conversation as Conversation;

        euphonyTemplate = html`
          <euphony-conversation
            id="euphony-conversation-${curID}"
            .conversationData=${curConversation}
            conversation-max-width=${ifDefined(
              this.isGridView ? undefined : '800'
            )}
            sharing-url=${ifDefined(
              this.isLoadingFromClipboard ? undefined : url
            )}
            data-file-url=${ifDefined(blobPath ?? undefined)}
            focus-mode-author=${JSON.stringify(this.focusModeAuthor)}
            focus-mode-recipient=${JSON.stringify(this.focusModeRecipient)}
            focus-mode-content-type=${JSON.stringify(this.focusModeContentType)}
            ?is-editable=${this.isEditorMode}
            ?is-showing-metadata=${this.globalIsShowingMetadata}
            ?should-render-markdown=${this.globalShouldRenderMarkdown}
            ?disable-editing-mode-save-button=${true}
            ?disable-preference-button=${true}
            ?disable-image-preview-window=${true}
            ?disable-token-window=${true}
            theme="light"
            style=${this.buildEuphonyStyle(this.euphonyStyleConfig)}
            @refresh-renderer-list-requested=${(
              e: CustomEvent<RefreshRendererListRequest>
            ) => {
              // This is not used, because we use the shared token window under app.ts
              if (this.isFrontendOnlyMode) {
                this.requestWorker
                  .frontendOnlyRefreshRendererListRequestHandler(e)
                  .then(
                    () => {},
                    () => {}
                  );
              } else {
                this.requestWorker.refreshRendererListRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @harmony-render-requested=${(
              e: CustomEvent<HarmonyRenderRequest>
            ) => {
              // This is not used, because we use the shared token window under app.ts
              if (this.isFrontendOnlyMode) {
                this.requestWorker
                  .frontendOnlyHarmonyRenderRequestHandler(e)
                  .then(
                    () => {},
                    () => {}
                  );
              } else {
                this.requestWorker.harmonyRenderRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @conversation-metadata-button-toggled=${(
              e: CustomEvent<boolean>
            ) => {
              this.conversationMetadataButtonToggled(e).then(
                () => {},
                () => {}
              );
            }}
            @markdown-button-toggled=${(e: CustomEvent<boolean>) => {
              this.markdownButtonToggled(e).then(
                () => {},
                () => {}
              );
            }}
            @translation-requested=${(e: CustomEvent<TranslationRequest>) => {
              if (this.isFrontendOnlyMode) {
                this.ensureOpenAIAPIKey()
                  .then(apiKey => {
                    if (apiKey) {
                      this.requestWorker
                        .frontendOnlyTranslationRequestHandler(e, apiKey)
                        .then(
                          () => {},
                          () => {}
                        );
                    } else {
                      // User cancelled or no key provided; reject to avoid hanging requests
                      e.detail.reject(
                        'OpenAI API key is required for frontend-only translation.'
                      );
                    }
                  })
                  .catch(() => {});
              } else {
                this.requestWorker.translationRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @fetch-message-sharing-url=${(
              e: CustomEvent<MessageSharingRequest>
            ) => {
              // Resolve the message's sharing URL
              this.requestWorker.fetchMessageSharingURLRequestHandler(
                e,
                curID,
                this.urlManager,
                blobPath
              );
            }}
            @harmony-render-button-clicked=${(e: CustomEvent<string>) => {
              this.harmonyRenderButtonClicked(e);
            }}
            @convo-deletion-button-clicked=${(e: CustomEvent<boolean>) => {
              const markedForDeletion = e.detail;
              if (markedForDeletion) {
                this.selectedConversationIDs.delete(curID);
              } else {
                this.selectedConversationIDs.add(curID);
              }
              this.requestUpdate();
            }}
          ></euphony-conversation>
        `;
      } else if (this.dataType === DataType.CODEX) {
        const curCodexSession = conversation as unknown[];
        euphonyTemplate = html`
          <euphony-codex
            id="euphony-conversation-${curID}"
            .sessionData=${curCodexSession}
            conversation-label="Session"
            conversation-max-width=${ifDefined(
              this.isGridView ? undefined : '800'
            )}
            sharing-url=${ifDefined(
              this.isLoadingFromClipboard ? undefined : url
            )}
            focus-mode-author=${JSON.stringify(this.focusModeAuthor)}
            focus-mode-recipient=${JSON.stringify(this.focusModeRecipient)}
            focus-mode-content-type=${JSON.stringify(this.focusModeContentType)}
            ?is-showing-metadata=${this.globalIsShowingMetadata}
            ?should-render-markdown=${this.globalShouldRenderMarkdown}
            ?disable-editing-mode-save-button=${true}
            ?disable-preference-button=${true}
            ?disable-image-preview-window=${true}
            ?disable-token-window=${true}
            theme="light"
            style=${this.buildEuphonyStyle(this.euphonyStyleConfig)}
            @refresh-renderer-list-requested=${(
              e: CustomEvent<RefreshRendererListRequest>
            ) => {
              if (this.isFrontendOnlyMode) {
                this.requestWorker
                  .frontendOnlyRefreshRendererListRequestHandler(e)
                  .then(
                    () => {},
                    () => {}
                  );
              } else {
                this.requestWorker.refreshRendererListRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @harmony-render-requested=${(
              e: CustomEvent<HarmonyRenderRequest>
            ) => {
              if (this.isFrontendOnlyMode) {
                this.requestWorker
                  .frontendOnlyHarmonyRenderRequestHandler(e)
                  .then(
                    () => {},
                    () => {}
                  );
              } else {
                this.requestWorker.harmonyRenderRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @conversation-metadata-button-toggled=${(
              e: CustomEvent<boolean>
            ) => {
              this.conversationMetadataButtonToggled(e).then(
                () => {},
                () => {}
              );
            }}
            @markdown-button-toggled=${(e: CustomEvent<boolean>) => {
              this.markdownButtonToggled(e).then(
                () => {},
                () => {}
              );
            }}
            @translation-requested=${(e: CustomEvent<TranslationRequest>) => {
              if (this.isFrontendOnlyMode) {
                this.ensureOpenAIAPIKey()
                  .then(apiKey => {
                    if (apiKey) {
                      this.requestWorker
                        .frontendOnlyTranslationRequestHandler(e, apiKey)
                        .then(
                          () => {},
                          () => {}
                        );
                    } else {
                      e.detail.reject(
                        'OpenAI API key is required for frontend-only translation.'
                      );
                    }
                  })
                  .catch(() => {});
              } else {
                this.requestWorker.translationRequestHandler(e).then(
                  () => {},
                  () => {}
                );
              }
            }}
            @fetch-message-sharing-url=${(
              e: CustomEvent<MessageSharingRequest>
            ) => {
              this.requestWorker.fetchMessageSharingURLRequestHandler(
                e,
                curID,
                this.urlManager,
                blobPath
              );
            }}
            @harmony-render-button-clicked=${(e: CustomEvent<string>) => {
              this.harmonyRenderButtonClicked(e);
            }}
          ></euphony-codex>
        `;
      } else {
        const curJSON = conversation as Record<string, unknown>;
        if (isCodexSessionSummaryEntry(curJSON)) {
          euphonyTemplate = html`
            <div class="codex-session-index-card" tabindex="0">
              <div class="codex-session-index-header">
                <button
                  class="codex-session-index-title codex-session-index-title-button"
                  @click=${() => {
                    this.loadData({
                      blobURL: curJSON.open_blob_url,
                      offset: 0,
                      limit: this.itemsPerPage,
                      jmespathQuery: this.jmespathQuery
                    }).then(
                      () => {},
                      () => {}
                    );
                  }}
                >
                  ${this.formatSessionDisplayTitle(curJSON.thread_name)}
                </button>
                <div class="codex-session-index-updated">
                  ${this.formatCodexUpdatedAt(curJSON.updated_at)}
                </div>
              </div>
              ${this.formatCodexSessionLocation(curJSON)
                ? html`
                    <div class="codex-session-index-meta-row">
                      <span class="codex-session-index-badge">
                        ${this.formatCodexSessionLocation(curJSON)}
                      </span>
                    </div>
                  `
                : html``}
            </div>
          `;
        } else if (isCodexSessionIndexEntry(curJSON)) {
          euphonyTemplate = html`
            <div class="codex-session-index-card" tabindex="0">
              <div class="codex-session-index-header">
                <div class="codex-session-index-title">
                  ${this.formatSessionDisplayTitle(curJSON.thread_name)}
                </div>
                <div class="codex-session-index-updated">
                  ${this.formatCodexUpdatedAt(curJSON.updated_at)}
                </div>
              </div>
            </div>
          `;
        } else {
          euphonyTemplate = html`
            <euphony-json-viewer
              tabindex="0"
              .data=${curJSON}
            ></euphony-json-viewer>
          `;
        }
      }

      // Add a checkbox for editor mode
      let checkboxTemplate = html``;
      if (this.isEditorMode) {
        checkboxTemplate = html`
          <input
            type="checkbox"
            .checked=${this.selectedConversationIDs.has(curID)}
            @change=${(e: InputEvent) => {
              const element = e.target as HTMLInputElement;
              if (element.checked) {
                this.selectedConversationIDs.add(curID);
              } else {
                this.selectedConversationIDs.delete(curID);
              }

              // Update the internal state of the affected conversation
              const conversationElement =
                this.shadowRoot?.querySelector<EuphonyConversation>(
                  `#euphony-conversation-${curID}`
                );
              if (conversationElement) {
                conversationElement.isConvoMarkedForDeletion = !element.checked;
              }

              this.requestUpdate();
            }}
          />
        `;
      }

      conversationsTemplate = html`
        ${conversationsTemplate}
        <div
          class="conversation-container ${isSessionSummary
            ? 'conversation-container-session-summary'
            : ''}"
          id=${`conversation-${curID}`}
          tabindex="0"
        >
          ${isSessionSummary
            ? html``
            : html`
                <span class="conversation-id">
                  <span class="share-button"
                    ><sl-copy-button
                      value=${url}
                      size="small"
                      copy-label="Copy sharable conversation URL"
                    ></sl-copy-button
                  ></span>
                  ${checkboxTemplate}
                  <a href=${`#conversation-${curID}`}>#${curID}</a>
                </span>
              `}

          ${euphonyTemplate}
        </div>
      `;
    }

    // Add a download button for editor mode
    let downloadButtonTemplate = html``;
    if (this.isEditorMode) {
      downloadButtonTemplate = html`
        <button
          class="button-load"
          @click=${() => {
            this.downloadButtonClicked();
          }}
        >
          Download
        </button>
      `;
    }

    // Add a select all button for editor mode
    let selectAllButtonTemplate = html``;
    if (this.isEditorMode) {
      selectAllButtonTemplate = html`
        <button
          class="select-all-button"
          @click=${() => {
            this.selectAllButtonClicked();
          }}
        >
          ${this.selectedConversationIDs.size === this.totalConversationSize
            ? 'Unselect All'
            : 'Select All'}
        </button>
      `;
    }

    // Tooltips
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

    // Preference window
    const preferenceWindowTemplate = html`
      <euphony-preference-window
        ?is-hidden=${!this.showPreferenceWindow}
        .enabledOptions=${{
          maxMessageHeight: true,
          gridView: true,
          advanced: true,
          messageLabel: true,
          focusMode: true,
          expandAndCollapseAll: true
        }}
        .defaultOptions=${{
          gridView: this.isGridView,
          gridViewColumnWidth: this.gridViewColumnWidth,
          comparisonWidth: this.comparisonColumnWidth
        }}
        @preference-window-close-clicked=${() => {
          this.showPreferenceWindow = false;
        }}
        @max-message-height-changed=${(e: CustomEvent<string>) => {
          this.preferenceWindowMaxMessageHeightChanged(e);
        }}
        @message-label-changed=${(e: CustomEvent<MessageLabelSettings>) => {
          this.preferenceWindowMessageLabelChanged(e);
        }}
        @grid-view-column-width-changed=${(e: CustomEvent<string>) => {
          this.preferenceWindowGridViewColumnWidthChanged(e);
        }}
        @comparison-width-changed=${(e: CustomEvent<string>) => {
          this.preferenceWindowComparisonWidthChanged(e);
        }}
        @layout-changed=${(e: CustomEvent<string>) => {
          this.preferenceWindowLayoutChanged(e);
        }}
        @expand-all-clicked=${() => {
          this.preferenceWindowExpandAllClicked();
        }}
        @collapse-all-clicked=${() => {
          this.preferenceWindowCollapseAllClicked();
        }}
        @translate-all-clicked=${() => {
          this.preferenceWindowTranslateAllClicked();
        }}
        @focus-mode-settings-changed=${(e: CustomEvent<FocusModeSettings>) => {
          this.preferenceWindowFocusModeSettingsChanged(e);
        }}
      ></euphony-preference-window>
    `;

    // Query labels
    let queryLabels = html``;
    if (this.jmespathQuery !== '') {
      queryLabels = html`${queryLabels}
        <div class="query-label">
          <span class="query-label-text">JMESPath=${this.jmespathQuery}</span>
          <span class="query-separator"></span>
          <span
            class="svg-icon icon"
            @click=${() => {
              this.resetFilter('jmespath').then(
                () => {},
                () => {}
              );
            }}
            >${unsafeHTML(iconClose)}</span
          >
        </div> `;
    }

    const localSessionFilterTemplate =
      this.isLocalSessionBrowserView && this.homeBrowseView === 'sessions'
        ? html`
            <div class="local-session-filter-bar">
              <sl-input
                size="small"
                placeholder="Filter sessions: title, first prompt, project, folder"
                .value=${this.localSessionSearchQuery}
                @sl-input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  this.localSessionSearchQuery = target.value;
                  this.queueLocalSessionFilterApply();
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    this.applyLocalSessionFilters().then(
                      () => {},
                      () => {}
                    );
                  }
                }}
              ></sl-input>
              <sl-input
                size="small"
                placeholder="Project"
                .value=${this.localSessionProjectQuery}
                @sl-input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  this.localSessionProjectQuery = target.value;
                  this.queueLocalSessionFilterApply();
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    this.applyLocalSessionFilters().then(
                      () => {},
                      () => {}
                    );
                  }
                }}
              ></sl-input>
              <sl-input
                size="small"
                placeholder="Folder"
                .value=${this.localSessionFolderQuery}
                @sl-input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  this.localSessionFolderQuery = target.value;
                  this.queueLocalSessionFilterApply();
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    this.applyLocalSessionFilters().then(
                      () => {},
                      () => {}
                    );
                  }
                }}
              ></sl-input>
              <button
                class="button-codex-secondary"
                @click=${() => {
                  this.localSessionSearchQuery = '';
                  this.localSessionProjectQuery = '';
                  this.localSessionFolderQuery = '';
                  this.applyLocalSessionFilters().then(
                    () => {},
                    () => {}
                  );
                }}
              >
                Clear
              </button>
            </div>
            <div class="local-search-help">
              Session filter searches session title, first real prompt, project, and folder metadata.
            </div>
            ${this.getLocalSessionMatchSummary().length > 0
              ? html`
                  <div class="local-search-match-summary">
                    ${this.getLocalSessionMatchSummary().map(
                      part => html`<span class="local-search-match-chip">${part}</span>`
                    )}
                  </div>
                `
              : html``}
          `
        : html``;

    const localQMDTemplate =
      this.isLocalSessionBrowserView && this.homeBrowseView === 'sessions'
        ? html`
            <div class="local-qmd-search-bar">
              <sl-input
                size="small"
                placeholder="Hybrid qmd search across Codex sessions"
                .value=${this.localQMDQuery}
                @sl-input=${(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  this.localQMDQuery = target.value;
                  this.queueLocalQMDSearch();
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    this.runLocalQMDSearch().then(
                      () => {},
                      () => {}
                    );
                  }
                }}
              ></sl-input>
              <button
                class="button-codex-secondary ${this.localQMDShowAllKeywordMatches
                  ? 'is-active'
                  : ''}"
                @click=${() => {
                  this.localQMDShowAllKeywordMatches =
                    !this.localQMDShowAllKeywordMatches;
                  if (this.localQMDQuery.trim() !== '') {
                    this.runLocalQMDSearch().then(
                      () => {},
                      () => {}
                    );
                  }
                }}
              >
                All keyword matches
              </button>
              ${(this.localSessionProjectQuery || this.localSessionFolderQuery) &&
              !this.isLoadingQMDResults
                ? html`
                    <div class="local-qmd-scope-note">
                      Scope:
                      ${this.localSessionProjectQuery || this.localSessionFolderQuery}
                    </div>
                  `
                : html``}
            </div>
            <div class="local-search-help">
              qmd runs hybrid search over local Codex session content: semantic plus keyword by default, or all keyword matches when you toggle that mode.
            </div>
            ${this.localQMDQuery.trim() !== ''
              ? html`
                  <div class="local-search-match-summary">
                    <span class="local-search-match-chip">
                      ${this.localQMDShowAllKeywordMatches
                        ? `Keyword query: "${this.localQMDQuery.trim()}"`
                        : `Hybrid qmd query: "${this.localQMDQuery.trim()}"`}
                    </span>
                    ${this.localQMDShowAllKeywordMatches
                      ? html`
                          <span class="local-search-match-chip">
                            Showing all keyword matches
                          </span>
                        `
                      : html``}
                    ${(this.localSessionProjectQuery || this.localSessionFolderQuery) &&
                    !this.isLoadingQMDResults
                      ? html`
                          <span class="local-search-match-chip">
                            Scope matches ${this.localSessionProjectQuery || this.localSessionFolderQuery}
                          </span>
                        `
                      : html``}
                  </div>
                `
              : html``}
            ${this.isLoadingQMDResults
              ? html`<div class="local-qmd-status">Searching qmd...</div>`
              : this.localQMDMessage
                ? html`
                    <div class="local-qmd-status">
                      ${this.localQMDMessage}
                      ${this.localQMDCollection
                        ? html`
                            <span class="local-qmd-status-meta">
                              ${this.localQMDCollection}
                              ${this.localQMDScope ? `· ${this.localQMDScope}` : ''}
                            </span>
                          `
                        : html``}
                    </div>
                  `
                : html``}
            ${this.localQMDResults.length > 0
              ? html`
                  <div class="local-qmd-results">
                    ${this.localQMDResults.map(
                      result => html`
                        <div class="local-qmd-result-card">
                          ${result.open_blob_url
                            ? html`
                                <button
                                  class="local-qmd-result-title local-qmd-result-title-button"
                                  @click=${() => {
                                    this.loadData({
                                      blobURL: result.open_blob_url!,
                                      offset: 0,
                                      limit: this.itemsPerPage,
                                      jmespathQuery: this.jmespathQuery
                                    }).then(
                                      () => {},
                                      () => {}
                                    );
                                  }}
                                >
                                  ${this.formatSessionDisplayTitle(result.title)}
                                </button>
                              `
                            : html`
                                <div class="local-qmd-result-title">
                                  ${this.formatSessionDisplayTitle(result.title)}
                                </div>
                              `}
                          <div class="local-qmd-result-path">
                            ${this.formatQMDResultPath(result.file, result)}
                          </div>
                          ${this.formatQMDMatchTypes(result) !== ''
                            ? html`
                                <div class="local-qmd-result-match-types">
                                  ${this.formatQMDMatchTypes(result)}
                                </div>
                              `
                            : html``}
                          <div class="local-qmd-result-snippet">
                            ${this.formatQMDResultSnippet(result.snippet)}
                          </div>
                        </div>
                      `
                    )}
                  </div>
                `
              : this.localQMDQuery.trim() !== '' && !this.isLoadingQMDResults
                ? html`
                    <div class="local-qmd-status">
                      No qmd matches found for this query in the current scope.
                    </div>
                  `
                : html``}
          `
        : html``;

    const localProjectBrowserTemplate =
      this.isLocalSessionBrowserView && this.homeBrowseView === 'projects'
        ? html`
            <div class="local-project-browser-cards">
              ${this.visibleProjectSummaries.map(
                project => html`
                  <button
                    class="local-project-card"
                    @click=${() => {
                      this.openProjectSessions(
                        project.project_name,
                        project.folder_path
                      ).then(
                        () => {},
                        () => {}
                      );
                    }}
                  >
                    <div class="local-project-card-title">
                      ${project.project_name}
                    </div>
                    <div class="local-project-card-path">
                      ${this.formatProjectCardPath(project.folder_path)}
                    </div>
                    <div class="local-project-card-count">
                      ${project.session_count} session${project.session_count === 1 ? '' : 's'}
                    </div>
                  </button>
                `
              )}
            </div>
          `
        : html``;

    const localProjectEmptyStateTemplate =
      this.isLocalSessionBrowserView &&
      this.homeBrowseView === 'projects' &&
      this.visibleProjectSummaries.length === 0
        ? html`
            <div class="local-project-empty-state">
              No projects matched the current filters.
            </div>
          `
        : html``;

    return html`
      <div
        class="app"
        ?is-loading=${this.isLoadingData}
        style=${this.buildEuphonyStyle(this.appStyleConfig)}
      >
        ${tooltipTemplate} ${preferenceWindowTemplate}

        <nightjar-confirm-dialog
          .header=${'Editor mode'}
          .message=${'Entering editor mode will disable pagination.'}
          .yesButtonText=${'Enter'}
        ></nightjar-confirm-dialog>

        <nightjar-input-dialog
          .header=${'Editor mode'}
          .message=${'Entering editor mode will disable pagination.'}
          .yesButtonText=${'Enter'}
        ></nightjar-input-dialog>

        <euphony-search-window
          @search-query-submitted=${(e: CustomEvent<string>) => {
            this.searchWindowQuerySubmitted(e).then(
              () => {},
              () => {}
            );
          }}
        ></euphony-search-window>

        <euphony-token-window
          @refresh-renderer-list-requested=${(
            e: CustomEvent<RefreshRendererListRequest>
          ) => {
            if (this.isFrontendOnlyMode) {
              this.requestWorker
                .frontendOnlyRefreshRendererListRequestHandler(e)
                .then(
                  () => {},
                  () => {}
                );
            } else {
              this.requestWorker.refreshRendererListRequestHandler(e).then(
                () => {},
                () => {}
              );
            }
          }}
          @harmony-render-requested=${(
            e: CustomEvent<HarmonyRenderRequest>
          ) => {
            if (this.isFrontendOnlyMode) {
              this.requestWorker
                .frontendOnlyHarmonyRenderRequestHandler(e)
                .then(
                  () => {},
                  () => {}
                );
            } else {
              this.requestWorker.harmonyRenderRequestHandler(e).then(
                () => {},
                () => {}
              );
            }
          }}
        ></euphony-token-window>

        <div class="toast-container">
          <nightjar-toast
            id="toast-euphony"
            duration=${TOAST_DURATIONS[this.toastType]}
            message=${this.toastMessage}
            type=${this.toastType}
          ></nightjar-toast>
        </div>

        <div class="header">
          <div class="header-branding">
            <a class="name" href="./"
              >${this.isEditorMode ? 'Euphony Editor' : 'Euphony Local'}</a
            >
            <div class="header-subtitle">
              Browse local Codex sessions, projects, and semantic search
            </div>
          </div>
          <input
            id="local-file-input"
            type="file"
            accept=".json,.jsonl,application/json,application/x-ndjson,text/plain"
            hidden
            @change=${(e: Event) => {
              this.localFileInputChanged(e);
            }}
          />
          <div class="header-nav">
            <button
              class="button-codex-secondary ${this.homeBrowseView === 'sessions'
                ? 'is-active'
                : ''}"
              @click=${() => {
                this.openHomeBrowseView('sessions').then(
                  () => {},
                  () => {}
                );
              }}
            >
              Sessions
            </button>
            <button
              class="button-codex-secondary ${this.homeBrowseView === 'projects'
                ? 'is-active'
                : ''}"
              @click=${() => {
                this.openHomeBrowseView('projects').then(
                  () => {},
                  () => {}
                );
              }}
            >
              Projects
            </button>
            ${this.isCodexSessionDetailView
              ? html`
                  <button
                    class="button-codex-secondary"
                    @click=${() => {
                      this.openHomeBrowseView('sessions').then(
                        () => {},
                        () => {}
                      );
                    }}
                  >
                    Back to sessions
                  </button>
                `
              : html``}
            ${downloadButtonTemplate}
          </div>

          <button
            class="button button-menu"
            @click=${() => {
              this.showToolBarMenu = !this.showToolBarMenu;
              if (this.showToolBarMenu) {
                const menuContainer =
                  this.shadowRoot?.querySelector<HTMLElement>(
                    '.menu-container'
                  );

                if (menuContainer) {
                  menuContainer.focus();
                }
              }
            }}
          >
            <span class="svg-icon question-icon">${unsafeHTML(iconInfo)}</span>
            <div
              class="menu-container"
              ?no-show=${!this.showToolBarMenu}
              tabindex="0"
              @blur=${(e: FocusEvent) => {
                // Ignore the blur event if it is from the button
                const relatedTarget = e.relatedTarget as HTMLElement | null;
                let timeout = 0;
                if (relatedTarget?.classList.contains('button-menu')) {
                  return;
                }

                // Check if the blur event is from the menu's button
                if (relatedTarget?.tagName === 'NIGHTJAR-MENU') {
                  timeout = 200;
                }

                setTimeout(() => {
                  this.showToolBarMenu = false;
                }, timeout);
              }}
            >
              <nightjar-menu
                .menuItems=${[
                  {
                    name: 'Preferences',
                    icon: iconSetting
                  },
                  {
                    name: 'Choose different Codex folder',
                    icon: iconLaptop
                  },
                  {
                    name: this.isEditorMode
                      ? 'Leave editor mode'
                      : 'Editor mode',
                    icon: iconEdit
                  },
                  {
                    name: 'Code',
                    icon: iconCode
                  }
                ]}
                @menu-item-clicked=${(e: CustomEvent<MenuItems>) => {
                  this.menuItemClicked(e);
                }}
              ></nightjar-menu>
            </div>
          </button>
        </div>

        ${localProjectBrowserTemplate}
        ${localProjectEmptyStateTemplate}
        ${localSessionFilterTemplate}
        ${localQMDTemplate}

        <div class="content">
          <div class="loader-container" ?is-loading=${this.isLoadingData}>
            <div class="loader-label">Loading data</div>
            <div class="loader"></div>
          </div>

          <div
            class="empty-error-message"
            ?is-hidden=${this.totalConversationSize > 0}
          >
            ☹️ No conversation loaded
          </div>

          <div class="content-center">
            ${this.homeBrowseView === 'projects' && this.isLocalSessionBrowserView
              ? html``
              : this.isQMDSearchMode
              ? html``
              : html`
                  <div class="grid-header" ?is-hidden=${this.totalConversationSize === 0}>
                    ${selectAllButtonTemplate}
                    <div class="count-label">
                      ${this.isEditorMode
                        ? `${NUM_FORMATTER(this.selectedConversationIDs.size)} / `
                        : ''}
                      ${NUM_FORMATTER(this.totalConversationSize)}
                      ${this.jmespathQuery !== '' ? 'matched' : 'total'}
                      ${this.dataType === DataType.JSON &&
                      (this.isCodexSessionIndexList(this.JSONData) ||
                        this.isCodexSessionSummaryList(this.JSONData))
                        ? 'sessions'
                        : this.dataType === DataType.JSON
                          ? 'items'
                          : 'conversations'}
                      ${this.jmespathQuery !== ''
                        ? `(${NUM_FORMATTER(this.totalConversationSizeIncludingUnfiltered)} total)`
                        : ''}
                    </div>
                    ${queryLabels}
                  </div>

                  <div class="conversation-list" ?is-grid-view=${this.isGridView}>
                    ${conversationsTemplate}
                  </div>

                  <div class="footer">
                    <nightjar-pagination
                      ?is-hidden=${this.totalConversationSize < 1}
                      .curPage=${this.curPage}
                      .totalPageNum=${this.totalPageNum}
                      .itemsPerPage=${this.itemsPerPage}
                      .itemsPerPageOptions=${[1, 2, 3, 4, 5, 10, 25, 50, 100]}
                      @page-clicked=${(e: CustomEvent<number>) => {
                        this.pageClicked(e);
                      }}
                      @items-per-page-changed=${(e: CustomEvent<number>) => {
                        this.itemsPerPageChanged(e);
                      }}
                    ></nightjar-pagination>
                  </div>
                `}
          </div>

          <div class="content-left">
            <div class="content-left-inner"></div>
            <div class="left-margin-footer">
              <div class="cache-row">
                <div
                  class="cache-info"
                  ?is-hidden=${!this.isLoadingFromCache}
                  @mouseenter=${(e: MouseEvent) => {
                    this.cacheInfoMouseEnter(e);
                  }}
                  @mouseleave=${() => {
                    this.cacheInfoMouseLeave();
                  }}
                >
                  <span class="svg-icon icon">
                    ${unsafeHTML(iconInfoSmall)}
                  </span>
                  <span class="cache-label"> Data loaded from cache</span>
                </div>
              </div>
            </div>
          </div>

          <div class="content-right">
            <div class="content-right-inner"></div>
            <div class="scroll-button-container">
              <button
                class="scroll-button scroll-button-up"
                ?is-visible=${this.showScrollTopButton}
                @click=${() => {
                  this.scrollToTop(0, 'smooth');
                }}
              >
                <span class="svg-icon icon"> ${unsafeHTML(iconArrowUp)} </span>
              </button>
              <button
                class="scroll-button scroll-button-down"
                ?is-visible=${this.showScrollTopButton}
                @click=${() => {
                  this.scrollToBottom('smooth');
                }}
              >
                <span class="svg-icon icon"> ${unsafeHTML(iconArrowUp)} </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  static styles = [
    css`
      ${unsafeCSS(shoelaceCSS)}
      ${unsafeCSS(componentCSS)}
    `
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'euphony-app': EuphonyApp;
  }
}
