import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees between tests so the jsdom document doesn't accumulate
// stale nodes across component tests (Testing Library's default teardown).
afterEach(cleanup);
