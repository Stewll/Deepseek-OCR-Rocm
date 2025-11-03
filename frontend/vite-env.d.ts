/// <reference types="vite/client" />

// Augment the import.meta.env types if you need custom vars
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_ENABLE_WEBCAM?: string;
  readonly VITE_ENABLE_FILE_UPLOAD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
