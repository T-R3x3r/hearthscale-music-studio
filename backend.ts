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
  },
};

export default backend;
