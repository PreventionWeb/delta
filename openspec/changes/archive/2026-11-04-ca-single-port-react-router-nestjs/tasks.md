## 1. Server composition
- [x] 1.1 Implement one HTTP listener for frontend and backend.
- [x] 1.2 Mount NestJS under `/api` using supplied Express instance mode.
- [x] 1.3 Mount React Router handler as terminal catch-all.
- [x] 1.4 Enforce route order: ops routes → `/api` → catch-all.

## 2. Runtime and scripts
- [x] 2.1 Keep `/healthz` and `/readyz` on unified server.
- [x] 2.2 Make same-origin browser API calls work without mandatory CORS in default mode.
- [x] 2.3 Update dev/start scripts and environment defaults for single-port operation.

## 3. Validation
- [x] 3.1 Add tests for `/api/*` ownership by NestJS.
- [x] 3.2 Add tests for non-API handling by React Router.
- [x] 3.3 Add smoke checks for `/`, deep link route, `/healthz`, `/readyz`.

## 4. Documentation
- [x] 4.1 Update architecture and local run docs for unified hosting.
