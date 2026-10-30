declare module "express" {
  export interface Request {
    path: string;
    originalUrl?: string;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
  }

  export interface Response {
    status(code: number): Response;
    json(body: unknown): Response;
    setHeader(name: string, value: string): Response;
    end(body?: string): Response;
  }

  export type NextFunction = (err?: unknown) => void;

  interface Server {
    close(): Promise<void>;
  }

  type ExpressApp = {
    disable(name: string): void;
    get(path: string, handler: (req: Request, res: Response) => void): void;
    use(handler: (req: Request, res: Response, next: NextFunction) => unknown): void;
    listen(port: number, hostname: string, callback?: () => void): Server;
    listen(port: number, callback?: () => void): Server;
    (req: any, res: any, next?: NextFunction): void;
  };

  const express: () => ExpressApp;

  export default express;
}
