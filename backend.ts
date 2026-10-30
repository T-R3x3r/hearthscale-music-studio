import type { AppContext, Backend, ToolBody } from '@hearthscale/app';

let ctx: AppContext;

/**
 * A tool of the assistant: the view that shows the song does the work, as
 * a press of its own buttons would, so the song has one writer and each
 * change is one step of its undo.
 */
function studio(tool: string, done: string): ToolBody {
  return async (input) => {
    await ctx.events.emit({ name: 'studio', data: { tool, input }, durable: false });
    return done;
  };
}

const backend: Backend = {
  activate(context) {
    ctx = context;
  },
  tools: {
    async forget_audio(input) {
      const { assets } = input as { assets: string[] };
      for (const asset of assets) await ctx.assets.release(asset);
      return `Deleted ${assets.length} audio file${assets.length === 1 ? '' : 's'}.`;
    },
    async export_parts(input) {
      const { root, files } = input as { root: string; files: { asset: string; name: string }[] };
      for (const file of files) {
        await ctx.fs.export(file.asset, { root, path: file.name });
        await ctx.assets.release(file.asset);
      }
      return `Saved ${files.length} file${files.length === 1 ? '' : 's'}.`;
    },
    make_music: studio('make_music', 'The studio makes it now. It shows on the timeline when it is ready.'),
    change_clip: studio('change_clip', 'The studio changes the clip now. The result plays as a new version when it is ready.'),
    split_clip: studio('split_clip', 'The studio splits the clip now. Its parts show on new tracks when they are ready.'),
    set_song: studio('set_song', 'Done.'),
    mix_track: studio('mix_track', 'Done.'),
  },
};

export default backend;
