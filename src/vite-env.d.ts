/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_DEV_BACKEND?: string;
  readonly VITE_BACKEND_MODE?: 'mock' | 'local' | 'external';
  readonly VITE_EXTERNAL_API_BASE?: string;
  readonly VITE_EXTERNAL_USER_ID?: string;
  readonly VITE_EXTERNAL_USER_DEPT?: string;
  readonly VITE_EXTERNAL_DEV_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
