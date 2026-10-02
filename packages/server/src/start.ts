/**
 * Starts a server directly, not through a CLI: `pnpm dev` (`tsx watch src/start.ts`) and
 * `pnpm start` (`node dist/start.js`). No CLI started it, so there is no resolved harness to
 * hand over; the server infers the CLI of the checkout it runs from, or offers none
 * (config.ts).
 */
import { startServer } from "./index.js";

await startServer();
