import { dirname } from 'pathe';
import type { Plugin } from 'vite';

export function createDirnameVarInjectionPlugin({
  name,
  variableName,
}: {
  name: string;
  variableName: string;
}): Plugin {
  return {
    name,
    enforce: 'post',
    transform: {
      order: 'post',
      handler(code: string, id: string) {
        if (!code.includes(variableName)) {
          return code;
        }

        return code.replaceAll(variableName, `"${dirname(id)}"`);
      },
    },
  };
}
