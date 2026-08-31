import { invoke } from '@tauri-apps/api/core'

const call = <T>(command: string, payload?: object) => invoke<T>(`plugin:omnath-model|${command}`, payload ? { payload } : undefined)
export const status = () => call('status')
export const loadModel = (modelId: 'base' | 'enhanced') => call('load_model', { modelId })
export const generate = (requestId: string, prompt: string) => call('generate', { requestId, prompt })
export const cancel = () => call('cancel')
export const unload = () => call('unload')
export const benchmark = () => call('benchmark')
