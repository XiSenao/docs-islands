import type { RenderController } from '@docs-islands/core/node/render-controller';
import type { Plugin, Rollup } from 'vite';

export function createFrameworkSpaSyncPlugin({
  framework,
  isTrackedChunk,
  name,
  renderController,
}: {
  framework: string;
  isTrackedChunk: (
    name: string,
    chunk: Rollup.OutputAsset | Rollup.OutputChunk,
  ) => chunk is Rollup.OutputChunk & { facadeModuleId: string };
  name: string;
  renderController: RenderController;
}): Plugin {
  let ssr = false;

  return {
    name,
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      ssr = Boolean(config.build.ssr);
    },
    generateBundle(_, bundles) {
      if (ssr) {
        return;
      }

      for (const name in bundles) {
        if (!Object.prototype.hasOwnProperty.call(bundles, name)) {
          continue;
        }

        const chunk = bundles[name];
        if (!isTrackedChunk(name, chunk)) {
          continue;
        }

        renderController.setClientChunkByFacadeModuleId(
          framework,
          chunk.facadeModuleId,
          {
            outputPath: name,
            code: chunk.code,
          },
        );
      }
    },
  };
}
