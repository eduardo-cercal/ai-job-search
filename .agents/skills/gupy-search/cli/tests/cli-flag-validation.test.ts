import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// All cases below fail validation before any network request, so this suite is
// network-free and safe to run in CI without hitting the live portal.

describe("gupy CLI flag validation", () => {
  test("an unknown search flag is rejected, not silently dropped", async () => {
    const result = await runCLI(["search", "--query", "flutter", "--bogus", "x"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("detail without an id fails before making a request", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_ID");
  });

  test("detail with an unparseable id fails before making a request", async () => {
    const result = await runCLI(["detail", "not-a-valid-id!!"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });

  test("--page=2 is rejected - this portal only ever serves page 1", async () => {
    const result = await runCLI(["search", "--page", "2"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("PAGINATION_UNSUPPORTED");
  });

  test("--jobage=0 is rejected", async () => {
    const result = await runCLI(["search", "--jobage", "0"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--remote with an unrecognized value is rejected", async () => {
    const result = await runCLI(["search", "--remote", "onsite"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCLI(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("gupy-cli");
  });

  test("an unknown command is rejected", async () => {
    const result = await runCLI(["bogus-command"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_CMD");
  });
});
