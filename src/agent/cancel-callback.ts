import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { logger } from '../logging';

/**
 * Cancel-callback HTTP endpoint — RFC-0001 §7.2 Option A.
 *
 * Parity with python-sdk's `macp_sdk.agent.cancel_callback`. The
 * examples-service's `BootstrapPayload.cancel_callback` field asks each
 * agent to listen on `http://host:port{path}` for a `POST` whose JSON
 * body is `{"runId": ..., "reason": ...}`. Receipt of the POST should
 * stop the participant cleanly — typically by calling `participant.stop()`.
 */

export type CancelHandler = (runId: string, reason: string) => void | Promise<void>;

export interface CancelCallbackServerOptions {
  host: string;
  port: number;
  path: string;
  onCancel: CancelHandler;
}

export interface CancelCallbackServer {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  close(): Promise<void>;
}

function normalisePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function startCancelCallbackServer(options: CancelCallbackServerOptions): Promise<CancelCallbackServer> {
  const path = normalisePath(options.path);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== path) {
        res.statusCode = 404;
        res.end();
        return;
      }

      let body: Record<string, unknown> = {};
      try {
        const raw = await readBody(req);
        if (raw) body = JSON.parse(raw);
      } catch {
        body = {};
      }

      const runId = String(body.runId ?? body.run_id ?? '');
      const reason = String(body.reason ?? '');
      logger.info('cancel_callback invoked', { runId, reason });

      try {
        await options.onCancel(runId, reason);
      } catch (err) {
        logger.error('cancel_callback handler raised', err);
        res.statusCode = 500;
        res.end();
        return;
      }

      res.statusCode = 202;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    });

    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);
      const addr = server.address() as AddressInfo;
      const boundHost = addr.address;
      const boundPort = addr.port;
      logger.debug(`cancel_callback listening on http://${boundHost}:${boundPort}${path}`);

      let closing = false;
      const handle: CancelCallbackServer = {
        host: boundHost,
        port: boundPort,
        path,
        close(): Promise<void> {
          if (closing) return Promise.resolve();
          closing = true;
          return new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      };
      resolve(handle);
    });
  });
}
