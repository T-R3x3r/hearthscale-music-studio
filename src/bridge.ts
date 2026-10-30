/**
 * The view's link to Hearthscale: the MCP Apps `App`, the typed call of the
 * `hearthscale/*` extensions, the host's notifications, and the addresses
 * the host context gives.
 */
import { App, McpUiMessageResultSchema, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { extensionCall } from '@hearthscale/app/view';
import type { CompletionRequest, SettingValues, ViewExtensionNotification, ViewHostContext } from '@hearthscale/app';

export const app = new App({ name: 'Music studio', version: '0.1.0' }, {}, { autoResize: false });
export const call = extensionCall(app);

type Listener = (note: ViewExtensionNotification) => void;
const listeners = new Set<Listener>();

/** Hears every `hearthscale/*` notification until the returned function runs. */
export function onNote(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

app.fallbackNotificationHandler = async (note) => {
  for (const listener of listeners) listener(note as ViewExtensionNotification);
};

function context(): Partial<ViewHostContext> {
  return (app.getHostContext() ?? {}) as Partial<ViewHostContext>;
}

/** The address an asset of the app streams from, whole or by range. */
export function assetUrl(asset: string): string {
  const base = context()['hearthscale/assetBytes'];
  if (!base) throw new Error('The host gives no address for audio');
  return base.url + asset;
}

/** The address of the app's own files under `assets/`. */
export function assetsUrl(): string {
  const base = context()['hearthscale/assets'];
  if (!base) throw new Error("The host gives no address for the app's files");
  return base.url;
}

export function settings(): SettingValues {
  return context()['hearthscale/settings'] ?? {};
}

export function widgetState(): unknown {
  return context()['hearthscale/widgetState'];
}

/** Keeps a value the host gives back as the widget state when it loads the view again. */
export async function keepWidgetState(state: unknown): Promise<void> {
  await app.request({ method: 'hearthscale/ui/set-widget-state', params: { state } } as never, McpUiMessageResultSchema);
}

export async function connect(): Promise<void> {
  await app.connect(new PostMessageTransport(window.parent, window.parent));
}

/** Calls a tool of the app's backend, labelled with the control that started it. */
export async function tool(name: string, args: Record<string, unknown>, label: string): Promise<void> {
  const result = await app.callServerTool({ name, arguments: args, _meta: { 'hearthscale/label': label } });
  if (result.isError) {
    const text = result.content.find((part) => part.type === 'text');
    throw new Error(text && 'text' in text ? text.text : `${name} failed`);
  }
}

/** Saves a file where the person picks in the system's dialog. False when they cancel. */
export async function saveFile(name: string, mimeType: string, blob: Blob): Promise<boolean> {
  const answer = (await app.request(
    {
      method: 'ui/download-file',
      params: { contents: [{ type: 'resource', resource: { uri: `file:///${name}`, mimeType, blob } }] },
    } as never,
    McpUiMessageResultSchema,
  )) as { isError?: boolean };
  return !answer.isError;
}

/** Stores a file's bytes as an asset of the app, streamed; answers the asset's id. */
export async function upload(name: string, mediaType: string, blob: Blob): Promise<string> {
  const answer = (await app.request(
    { method: 'hearthscale/ui/upload-file', params: { name, mediaType, blob } } as never,
    McpUiMessageResultSchema,
  )) as { asset?: string };
  if (!answer.asset) throw new Error(`${name} was not kept`);
  return answer.asset;
}

/** The whole answer of a completion on the app's chat model; rejects with the model's error. */
export async function complete(request: CompletionRequest): Promise<string> {
  const stream = crypto.randomUUID();
  let text = '';
  let failure: string | null = null;
  const stop = onNote((note) => {
    if (note.method !== 'hearthscale/models/delta' || note.params.stream !== stream) return;
    const { delta } = note.params;
    if ('text' in delta) {
      if (!delta.reasoning) text += delta.text;
    } else if (delta.stop === 'error') {
      failure = delta.error ?? 'The chat model failed.';
    }
  });
  try {
    await call('hearthscale/models/complete', { stream, request });
  } finally {
    stop();
  }
  if (failure) throw new Error(failure);
  return text;
}

/** The host's words of a refused request, without the protocol's prefix. */
export function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^MCP error -?\d+:\s*/, '');
}
