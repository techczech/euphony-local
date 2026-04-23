const DB_NAME = 'euphony-local';
const STORE_NAME = 'handles';
const CODEX_DIRECTORY_KEY = 'codex-directory';

type PermissionMode = 'read' | 'readwrite';
type PermissionState = 'granted' | 'denied' | 'prompt';

interface FileSystemPermissionDescriptor {
  mode?: PermissionMode;
}

interface FileSystemHandleWithPermission {
  queryPermission(
    descriptor?: FileSystemPermissionDescriptor
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemPermissionDescriptor
  ): Promise<PermissionState>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: {
    mode?: PermissionMode;
  }) => Promise<FileSystemDirectoryHandle>;
}

const openDB = async (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB.'));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });

const getFromStore = async <T>(key: string): Promise<T | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read from IndexedDB.'));
    };
    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
};

const putInStore = async (key: string, value: unknown): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to write to IndexedDB.'));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Failed to commit IndexedDB write.'));
    };
  });
};

export const isFileSystemAccessSupported = () =>
  typeof (window as WindowWithDirectoryPicker).showDirectoryPicker ===
  'function';

export const saveCodexDirectoryHandle = async (
  handle: FileSystemDirectoryHandle
) => {
  await putInStore(CODEX_DIRECTORY_KEY, handle);
};

export const getStoredCodexDirectoryHandle = async () =>
  getFromStore<FileSystemDirectoryHandle>(CODEX_DIRECTORY_KEY);

export const ensureDirectoryPermission = async (
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = false
) => {
  const options = { mode: 'read' as const };
  const permissionHandle = handle as FileSystemDirectoryHandle &
    FileSystemHandleWithPermission;
  const currentPermission = await permissionHandle.queryPermission(options);
  if (currentPermission === 'granted') {
    return true;
  }

  if (!requestIfNeeded) {
    return false;
  }

  return (await permissionHandle.requestPermission(options)) === 'granted';
};

export const connectCodexDirectory = async () => {
  const pickerWindow = window as WindowWithDirectoryPicker;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error('File System Access API is not available.');
  }

  const handle = await pickerWindow.showDirectoryPicker({ mode: 'read' });
  await saveCodexDirectoryHandle(handle);
  return handle;
};

const getOptionalDirectoryHandle = async (
  parent: FileSystemDirectoryHandle,
  name: string
) => {
  try {
    return await parent.getDirectoryHandle(name);
  } catch (_error) {
    return null;
  }
};

const getOptionalFileHandle = async (
  parent: FileSystemDirectoryHandle,
  name: string
) => {
  try {
    return await parent.getFileHandle(name);
  } catch (_error) {
    return null;
  }
};

const listFiles = async (directoryHandle: FileSystemDirectoryHandle) => {
  const files: FileSystemFileHandle[] = [];
  const asyncIterable = directoryHandle as FileSystemDirectoryHandle & {
    values(): AsyncIterable<FileSystemHandle>;
  };

  for await (const entry of asyncIterable.values()) {
    if (entry.kind === 'file') {
      files.push(entry as FileSystemFileHandle);
    }
  }
  return files;
};

export const getLatestArchivedCodexFile = async (
  codexDirectoryHandle: FileSystemDirectoryHandle
) => {
  const archivedDirectory = await getOptionalDirectoryHandle(
    codexDirectoryHandle,
    'archived_sessions'
  );
  if (!archivedDirectory) {
    return null;
  }

  const fileHandles = await listFiles(archivedDirectory);
  const jsonlHandles = fileHandles
    .filter(handle => handle.name.endsWith('.jsonl'))
    .sort((a, b) => b.name.localeCompare(a.name));

  return jsonlHandles[0] ?? null;
};

export const getCodexIndexFile = async (
  codexDirectoryHandle: FileSystemDirectoryHandle
) => {
  return getOptionalFileHandle(codexDirectoryHandle, 'session_index.jsonl');
};

export const getCodexHistoryFile = async (
  codexDirectoryHandle: FileSystemDirectoryHandle
) => {
  return getOptionalFileHandle(codexDirectoryHandle, 'history.jsonl');
};
