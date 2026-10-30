import type { AppContext, Backend } from '@hearthscale/app';

let ctx: AppContext;

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
  },
};

export default backend;
