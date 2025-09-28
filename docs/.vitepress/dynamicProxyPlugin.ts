import httpProxy from 'http-proxy';
import { type ChildProcess, spawn } from 'node:child_process';
import type { Plugin } from 'vite';

const runningProjects = new Map<string, { port: number; process: ChildProcess }>();
const proxy = httpProxy.createProxyServer();

function startProjectServer(projectName: string): Promise<number> {
  console.log(`[Proxy] Starting dev server for: @docs-islands/${projectName}...`);

  return new Promise((resolve, reject) => {
    const projectProcess = spawn('pnpm', ['--filter', `@docs-islands/${projectName}`, 'docs:dev'], {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    projectProcess.stdout.on('data', data => {
      const output = data.toString();
      console.log(`[${projectName}] ${output.trim()}`);

      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match && match[1]) {
        const port = Number.parseInt(match[1], 10);
        console.log(`[Proxy] Detected @docs-islands/${projectName} running on port: ${port}`);
        runningProjects.set(projectName, { port, process: projectProcess });
        resolve(port);
      }
    });

    projectProcess.stderr.on('data', data => {
      console.error(`[${projectName} ERROR] ${data.toString().trim()}`);
    });

    projectProcess.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`${projectName} server exited with code ${code}`));
        runningProjects.delete(projectName);
      }
    });
  });
}

export function dynamicProxyPlugin(): Plugin {
  return {
    name: 'vite-plugin-dynamic-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        const validProjects = ['vitepress'];
        const projectName = validProjects.find(projectName => {
          const base = `/docs-islands/${projectName}`;
          return (req.url || '').startsWith(base);
        });

        if (!projectName) {
          return next();
        }

        try {
          let projectInfo = runningProjects.get(projectName);

          if (!projectInfo) {
            await startProjectServer(projectName);
            projectInfo = runningProjects.get(projectName)!;
          }
          req.url = req.url.replace(`/docs-islands/${projectName}`, '');
          proxy.web(
            req,
            res,
            {
              target: `http://localhost:${projectInfo.port}/docs-islands/${projectName}`
            },
            err => {
              console.error(`[Proxy Error]`, err);
              res.statusCode = 502;
              res.end(`Bad Gateway: Could not connect to ${projectName} server.`);
            }
          );
        } catch (error) {
          console.error(`Failed to start or proxy for ${projectName}:`, error);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
        return undefined;
      });
    }
  };
}
