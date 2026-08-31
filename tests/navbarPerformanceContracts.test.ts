import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("navbar recurring work", () => {
  it("isolates the one-second clock from the full navbar render", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    const navbarComponent = navbar.slice(navbar.indexOf("export const Navbar"));

    expect(navbar).toContain("function PhilippineTime");
    expect(navbar).toContain("function formatPhilippineTime");
    expect(navbar).toContain("philippineTimeFormatter ??= new Intl.DateTimeFormat");
    expect(navbar).toContain("const NAV_LINKS");
    expect(navbarComponent).not.toContain("setInterval(");
    expect(navbarComponent).not.toContain("setTimeStr(");
  });
});
