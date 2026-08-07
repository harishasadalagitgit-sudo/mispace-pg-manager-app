import { ElectronAPI } from '@electron-toolkit/preload'

export interface DesktopApi {
  exportCSV: (content: string, defaultFileName: string) => Promise<{ ok: boolean; path?: string }>
  exportBinary: (
    data: Uint8Array,
    defaultFileName: string
  ) => Promise<{ ok: boolean; path?: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
