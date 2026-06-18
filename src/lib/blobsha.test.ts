import { describe, expect, it } from "vitest";
import { gitBlobSha } from "./blobsha";

// Vectors from `git hash-object` so the build-time sha matches GitHub's trees API.
describe("gitBlobSha", () => {
  it("matches git's empty-blob hash", () => {
    expect(gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });

  it("matches git hash-object for 'hello\\n'", () => {
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  it("changes when content changes", () => {
    expect(gitBlobSha("# A")).not.toBe(gitBlobSha("# B"));
  });
});
