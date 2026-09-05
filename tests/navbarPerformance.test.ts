import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const navbarSource = fs.readFileSync(
  path.join(process.cwd(), "src", "components", "Navbar.tsx"),
  "utf8",
);

function readPngDimensions(filePath: string) {
  const image = fs.readFileSync(filePath);
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

describe("navbar performance contracts", () => {
  it.each([
    ["light", "navbar-logo-light.png"],
    ["dark", "navbar-logo-dark.png"],
  ])("uses a bounded %s logo source", (_theme, fileName) => {
    const filePath = path.join(process.cwd(), "public", fileName);

    expect(readPngDimensions(filePath)).toEqual({ width: 256, height: 256 });
    expect(fs.statSync(filePath).size).toBeLessThan(150_000);
    expect(navbarSource).toContain(`src="/${fileName}"`);
  });

  it("does not use the high-resolution source logos in the navbar", () => {
    expect(navbarSource).not.toContain('src="/NEWLOGO.PNG"');
    expect(navbarSource).not.toContain('src="/NEWLOGODARK.png"');
  });

  it("does not prefetch secondary routes during homepage load", () => {
    expect(navbarSource).toContain("prefetch={false}");
  });
});
