/**
 * FuzzerSessionLoader — the server leg's SessionLoader double (DESIGN.md §4.4 channel B:
 * "the fake SessionLoader carries the FuzzerLLM"). The sessions it returns are the repo's own
 * test fixture shape (packages/server/test/fixtures/session.ts's fakeSession): every member
 * answers as an idle session does, and `run` replays a per-session FuzzerLLM script, so the
 * SessionManager's real run loop (entry state machine, SSE publication, usage recording,
 * error convergence) drives real code while no LLM exists behind the seam.
 */
import type { SessionRow } from "../../../../packages/server/src/db/repos/sessions.js";
import type {
  RuntimeSession,
  SessionLoader,
} from "../../../../packages/server/src/runtime/session-manager.js";
import { fakeSession } from "../../../../packages/server/test/fixtures/session.js";
import { FuzzerLLM, type TurnScript } from "./fuzzer-llm.js";

export interface LoadedFake {
  sessionId: string;
  llm: FuzzerLLM;
}

export class FuzzerSessionLoader implements SessionLoader {
  readonly loaded: LoadedFake[] = [];

  constructor(
    private readonly scriptFor: (row: SessionRow, index: number) => TurnScript[],
    private readonly behavior: Partial<Omit<RuntimeSession, "sessionId" | "run">> = {},
  ) {}

  async load(row: SessionRow): Promise<RuntimeSession> {
    const llm = new FuzzerLLM(this.scriptFor(row, this.loaded.length));
    const session = fakeSession(row.sessionId, {
      provider: row.provider,
      modelId: row.modelId,
      async *run(
        input: import("../../../../packages/core/src/omnimessage/index.js").OmniMessage[],
      ) {
        const stream = llm.streamGenerate({ newMessages: input });
        for (;;) {
          const res = await stream.next();
          if (res.done) return;
          yield res.value;
        }
      },
      ...this.behavior,
    });
    this.loaded.push({ sessionId: row.sessionId, llm });
    return session;
  }
}
