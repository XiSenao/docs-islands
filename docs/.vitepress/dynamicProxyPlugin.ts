import Logger from '@docs-islands/utils/logger';
import httpProxy from 'http-proxy';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Plugin } from 'vite';

interface ProjectInfo {
  port: number;
  process: ChildProcess;
}

interface ProxyConfig {
  validProjects: string[];
  basePath: string;
  packageScope: string;
  devCommand: string;
  startupTimeout: number;
  shutdownTimeout: number;
}

const DEFAULT_CONFIG: ProxyConfig = {
  validProjects: ['vitepress'],
  basePath: '/docs-islands',
  packageScope: '@docs-islands',
  devCommand: 'docs:dev',
  startupTimeout: 60_000,
  shutdownTimeout: 5000
};

class ProjectManager {
  private runningProjects = new Map<string, ProjectInfo>();
  private startingProjects = new Map<string, Promise<number>>();
  private logger: Logger;
  private cleanupHandlers: Array<() => void> = [];
  private config: ProxyConfig;

  constructor(config: ProxyConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getOrStartProject(projectName: string): Promise<ProjectInfo> {
    const existing = this.runningProjects.get(projectName);
    if (existing) {
      this.logger.debug(`Project ${projectName} already running on port ${existing.port}`);
      return existing;
    }

    // Check if already starting (mutex lock).
    const starting = this.startingProjects.get(projectName);
    if (starting) {
      this.logger.debug(`Project ${projectName} is already starting, waiting...`);
      await starting;
      const projectInfo = this.runningProjects.get(projectName);
      if (!projectInfo) {
        throw new Error(`Project ${projectName} started but not found in registry`);
      }
      return projectInfo;
    }

    this.logger.info(`Lazy starting dev server for: ${this.config.packageScope}/${projectName}...`);
    const startPromise = this.startProjectServer(projectName);
    this.startingProjects.set(projectName, startPromise);

    try {
      await startPromise;
      const projectInfo = this.runningProjects.get(projectName);
      if (!projectInfo) {
        throw new Error(`Project ${projectName} started but not found in registry`);
      }
      return projectInfo;
    } finally {
      this.startingProjects.delete(projectName);
    }
  }

  private async startProjectServer(projectName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const projectProcess = spawn(
        'pnpm',
        ['--filter', `${this.config.packageScope}/${projectName}`, this.config.devCommand],
        {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          reject(
            new Error(
              `Timeout: ${projectName} server failed to start within ${this.config.startupTimeout}ms`
            )
          );
          projectProcess.kill('SIGKILL');
        }
      }, this.config.startupTimeout);

      const handleOutput = (data: Buffer) => {
        const output = data.toString();
        this.logger.debug(`[${projectName}] ${output.trim()}`);

        const match = output.match(/https?:\/\/localhost:(\d+)/);
        if (match?.[1] && !resolved) {
          const port = Number.parseInt(match[1], 10);
          this.verifyServerHealth(port)
            .then(() => {
              resolved = true;
              clearTimeout(timeout);
              this.logger.info(
                `✓ ${this.config.packageScope}/${projectName} running on port: ${port}`
              );
              this.runningProjects.set(projectName, { port, process: projectProcess });
              resolve(port);
            })
            .catch(error => {
              this.logger.warn(`Port ${port} detected but health check failed: ${error}`);
            });
        }
      };

      projectProcess.stdout.on('data', handleOutput);
      projectProcess.stderr.on('data', data => {
        const output = data.toString();
        this.logger.error(`[${projectName}] ${output.trim()}`);
        handleOutput(data);
      });

      projectProcess.on('exit', code => {
        clearTimeout(timeout);
        this.logger.info(
          `${this.config.packageScope}/${projectName} server exited with code ${code}`
        );
        this.runningProjects.delete(projectName);
        if (code !== 0 && !resolved) {
          reject(new Error(`${projectName} server exited with code ${code}`));
        }
      });
    });
  }

  private async verifyServerHealth(port: number, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`http://localhost:${port}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok || response.status === 404) {
          return;
        }
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async cleanup(): Promise<void> {
    this.logger.info('Shutting down child servers...');
    const shutdownPromises: Promise<void>[] = [];

    for (const [projectName, { process }] of this.runningProjects.entries()) {
      shutdownPromises.push(this.shutdownProcess(projectName, process));
    }

    await Promise.allSettled(shutdownPromises);
    this.runningProjects.clear();
    this.startingProjects.clear();
  }

  private async shutdownProcess(projectName: string, childProcess: ChildProcess): Promise<void> {
    return new Promise(resolve => {
      this.logger.info(`Shutting down ${projectName} server...`);

      const forceKillTimer = setTimeout(() => {
        this.logger.warn(`${projectName} did not exit gracefully, sending SIGKILL`);
        childProcess.kill('SIGKILL');
      }, this.config.shutdownTimeout);

      childProcess.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      childProcess.kill('SIGTERM');
    });
  }

  registerCleanupHandler(handler: () => void): void {
    this.cleanupHandlers.push(handler);
  }
}

class ProxyHandler {
  private proxy: httpProxy;
  private logger: Logger;
  private config: ProxyConfig;
  private projectManager: ProjectManager;

  constructor(config: ProxyConfig, projectManager: ProjectManager, logger: Logger) {
    this.config = config;
    this.projectManager = projectManager;
    this.logger = logger;
    this.proxy = httpProxy.createProxyServer({
      proxyTimeout: 30_000,
      timeout: 30_000
    });

    this.setupProxyErrorHandlers();
  }

  private setupProxyErrorHandlers(): void {
    this.proxy.on('error', (err, _req, res) => {
      const errorType = this.classifyError(err);
      this.logger.error(`Proxy error [${errorType}]: ${err.message}`);

      if ('headersSent' in res && res.headersSent) {
        this.logger.warn('Headers already sent, cannot send error response');
        return;
      }

      if ('writeHead' in res && typeof res.writeHead === 'function') {
        try {
          const statusCode = errorType === 'TIMEOUT' ? 504 : 502;
          const message =
            errorType === 'TIMEOUT'
              ? 'Gateway Timeout: Target server did not respond in time'
              : `Bad Gateway: ${err.message}`;

          res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
          res.end(message);
        } catch (writeError) {
          this.logger.error(`Failed to send error response: ${writeError}`);
        }
      }
    });

    this.proxy.on('proxyReq', (_proxyReq, req) => {
      this.logger.debug(`Proxying ${req.method} ${req.url}`);
    });

    this.proxy.on('proxyRes', (proxyRes, req) => {
      this.logger.debug(`Received ${proxyRes.statusCode} for ${req.method} ${req.url}`);
    });
  }

  private classifyError(err: Error): 'TIMEOUT' | 'CONNECTION_REFUSED' | 'ECONNRESET' | 'OTHER' {
    const message = err.message.toLowerCase();
    if (message.includes('timeout') || err.name === 'TimeoutError') return 'TIMEOUT';
    if (message.includes('econnrefused')) return 'CONNECTION_REFUSED';
    if (message.includes('econnreset')) return 'ECONNRESET';
    return 'OTHER';
  }

  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void | boolean> {
    if (!req.url) return next();

    const projectName = this.findMatchingProject(req.url);
    if (!projectName) return next();

    try {
      const projectInfo = await this.projectManager.getOrStartProject(projectName);
      const originalUrl = req.url;

      this.logger.info(
        `HTTP ${req.method} ${originalUrl} -> http://localhost:${projectInfo.port}${originalUrl}`
      );

      this.proxy.web(req, res, {
        target: `http://localhost:${projectInfo.port}`,
        changeOrigin: true,
        preserveHeaderKeyCase: true,
        autoRewrite: true
      });
    } catch (error) {
      this.logger.error(`Failed to proxy HTTP request for ${projectName}: ${error}`);

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(
          `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    return undefined;
  }

  async handleWebSocketUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const url = req.url;
    if (!url) return;

    const projectName = this.findMatchingProject(url);
    if (!projectName) return;

    try {
      const projectInfo = await this.projectManager.getOrStartProject(projectName);

      this.logger.info(`WebSocket ${url} -> ws://localhost:${projectInfo.port}${url}`);

      this.proxy.ws(req, socket, head, {
        target: `ws://localhost:${projectInfo.port}`,
        ws: true,
        changeOrigin: true
      });
    } catch (error) {
      this.logger.error(`Failed to proxy WebSocket for ${projectName}: ${error}`);
      socket.destroy();
    }
  }

  private findMatchingProject(url: string): string | undefined {
    return this.config.validProjects.find(projectName => {
      const base = `${this.config.basePath}/${projectName}`;
      return url.startsWith(base);
    });
  }

  destroy(): void {
    this.proxy.close();
  }
}

export function dynamicProxyPlugin(userConfig?: Partial<ProxyConfig>): Plugin {
  const config: ProxyConfig = { ...DEFAULT_CONFIG, ...userConfig };
  const logger = Logger.getLoggerByGroup('dynamic-proxy');
  const projectManager = new ProjectManager(config, logger);
  const proxyHandler = new ProxyHandler(config, projectManager, logger);

  let cleanupRegistered = false;

  return {
    name: 'vite-plugin-dynamic-proxy',
    apply: 'serve',
    configureServer(server) {
      // HTTP middleware.
      server.middlewares.use((req, res, next) => {
        proxyHandler.handleHttpRequest(req, res, next).catch(error => {
          logger.error(`Unexpected error in HTTP middleware: ${error}`);
          next();
        });
      });

      // WebSocket upgrade handler.
      server.httpServer?.on('upgrade', (req, socket, head) => {
        proxyHandler.handleWebSocketUpgrade(req, socket, head).catch(error => {
          logger.error(`Unexpected error in WebSocket upgrade: ${error}`);
          socket.destroy();
        });
      });

      // Register cleanup handlers only once.
      if (!cleanupRegistered) {
        cleanupRegistered = true;

        const shutdownHandler = () => {
          logger.info('Received shutdown signal, cleaning up...');
          projectManager
            .cleanup()
            .then(() => {
              proxyHandler.destroy();
              logger.info('Cleanup completed');
              process.exit(0);
            })
            .catch(error => {
              logger.error(`Error during cleanup: ${error}`);
              process.exit(1);
            });
        };

        /**
         * Note: 'exit' event doesn't allow async operations, so we skip it.
         * SIGINT and SIGTERM are the proper cleanup points.
         */
        process.once('SIGINT', shutdownHandler);
        process.once('SIGTERM', shutdownHandler);
      }
    },

    async closeBundle() {
      // Cleanup when Vite server closes.
      return projectManager.cleanup().then(() => {
        proxyHandler.destroy();
      });
    }
  };
}
