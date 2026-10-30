/**
 * The view's link to Hearthscale: the MCP Apps `App`, the typed call of the
 * `hearthscale/*` extensions, the host's notifications, and the addresses
 * the host context gives.
 */
import { App, McpUiMessageResultSchema, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { extensionCall } from '@hearthscale/app/view';
import { sentenceCase } from './text';
import type {
  CompletionRequest,
  HostSlot,
  HostSlotNotification,
  SettingValues,
  ViewExtensionNotification,
  ViewHostContext,
} from '@hearthscale/app';

export const app = new App({ name: 'Music studio', version: '0.1.0' }, {}, { autoResize: false });
export const call = extensionCall(app);

type Note = ViewExtensionNotification | HostSlotNotification;
type Listener = (note: Note) => void;
const listeners = new Set<Listener>();

/** Hears every `hearthscale/*` notification until the returned function runs. */
export function onNote(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

app.fallbackNotificationHandler = async (note) => {
  for (const listener of listeners) listener(note as Note);
};

/** A file the person opened with the app, as the host hands it to the view. */
export interface OpenedFile {
  name: string;
  resourceUri: string;
}

let firstInput: (input: { file?: OpenedFile }) => void;

/** The view's first tool input: `{}`, or the file the person opened the app with. */
export const toolInput = new Promise<{ file?: OpenedFile }>((resolve) => {
  firstInput = resolve;
});

app.ontoolinput = ({ arguments: input }) => firstInput((input ?? {}) as { file?: OpenedFile });

/** The bytes of a file the person opened with the app. */
export async function readOpened(file: OpenedFile): Promise<Uint8Array<ArrayBuffer>> {
  const { contents } = await app.readServerResource({
    uri: file.resourceUri,
    _meta: { 'openai/resource': { representation: 'blob' } },
  });
  const first = contents[0];
  if (!first || !('blob' in first)) throw new Error(`Music studio could not open ${file.name}. Try again.`);
  return Uint8Array.from(atob(first.blob), (c) => c.charCodeAt(0));
}

const lookListeners = new Set<() => void>();

/** Runs `listener` after each change of the host context, such as the theme or the colour scheme, until the returned function runs. */
export function onLookChange(listener: () => void): () => void {
  lookListeners.add(listener);
  return () => lookListeners.delete(listener);
}

app.onhostcontextchanged = () => {
  for (const listener of lookListeners) listener();
};

function context(): Partial<ViewHostContext> {
  return (app.getHostContext() ?? {}) as Partial<ViewHostContext>;
}

/** The address an asset of the app streams from, whole or by range. */
export function assetUrl(asset: string): string {
  const base = context()['hearthscale/assetBytes'];
  if (!base) throw new Error('Music studio could not reach its audio. Open it again.');
  return base.url + asset;
}

/** The address of the app's own files under `assets/`. */
export function assetsUrl(): string {
  const base = context()['hearthscale/assets'];
  if (!base) throw new Error('Music studio could not reach its files. Open it again.');
  return base.url;
}

export function settings(): SettingValues {
  return context()['hearthscale/settings'] ?? {};
}

export function widgetState(): unknown {
  return context()['hearthscale/widgetState'];
}

let kept: Record<string, unknown> | null = null;

/** Keeps values the host gives back in the widget state when it loads the view again, beside the ones kept before. */
export async function keepWidgetState(values: Record<string, unknown>): Promise<void> {
  kept = { ...(kept ?? ((widgetState() as Record<string, unknown> | null) ?? {})), ...values };
  await app.request({ method: 'hearthscale/ui/set-widget-state', params: { state: kept } } as never, McpUiMessageResultSchema);
}

/** Reserves the shell's slots, such as the chat, at their places in the view; an empty list removes them. */
export async function placeSlots(slots: HostSlot[]): Promise<void> {
  await app.request({ method: 'hearthscale/ui/slots', params: { slots } } as never, McpUiMessageResultSchema);
}

/** Puts text into a chip above the chat slot `slot`, which the next message there carries. */
export async function chatContext(slot: string, title: string, text: string): Promise<void> {
  await app.request(
    {
      method: 'ui/update-model-context',
      params: {
        content: [{ type: 'text', text, _meta: { 'openai/title': title } }],
        _meta: { 'hearthscale/modelContext': { slot } },
      },
    } as never,
    McpUiMessageResultSchema,
  );
}

export async function connect(): Promise<void> {
  await app.connect(new PostMessageTransport(window.parent, window.parent));
}

/** Calls a tool of the app's backend, labelled with the control that started it. */
export async function tool(name: string, args: Record<string, unknown>, label: string): Promise<void> {
  const result = await app.callServerTool({ name, arguments: args, _meta: { 'hearthscale/label': label } });
  if (result.isError) {
    const text = result.content.find((part) => part.type === 'text');
    throw new Error(text && 'text' in text ? text.text : `${label} did not finish. Try again.`);
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
  if (!answer.asset) throw new Error(`Music studio could not save ${name}. Try again.`);
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
      failure = delta.error ?? 'The chat model stopped. Try again.';
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

/** The host's words of a refused request, without the protocol's prefix, as a sentence. */
export function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return sentenceCase(text.replace(/^MCP error -?\d+:\s*/, ''));
}
