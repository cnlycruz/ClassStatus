import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

describe("public micro-interactions", () => {
  it("replays a bounded download-arrow motion without changing the share-card button layout", () => {
    const hero = read("src", "components", "StatusHero.tsx");
    const styles = read("src", "app", "globals.css");

    expect(hero).toContain("const [downloadAnimationKey, setDownloadAnimationKey] = React.useState(0)");
    expect(hero).toContain("setDownloadAnimationKey((current) => current + 1)");
    expect(hero).toContain("key={downloadAnimationKey}");
    expect(hero).toContain("animate-share-card-download motion-reduce:animate-none");
    expect(hero).toContain("disabled={isShareCardGenerating}");
    expect(styles).toContain("@keyframes share-card-download");
    expect(styles).toContain("translateY(0.2rem)");
    expect(styles).toContain("animation: share-card-download 280ms");
    expect(styles).toContain(".animate-share-card-download");
  });

  it("layers fixed-size sun and moon icons without animating during hydration or reduced motion", () => {
    const navbar = read("src", "components", "Navbar.tsx");
    const styles = read("src", "app", "globals.css");

    expect(navbar).toContain("const [themeMotionReady, setThemeMotionReady] = useState(false)");
    expect(navbar).toContain("requestAnimationFrame(() => setThemeMotionReady(true))");
    expect(navbar).toContain('className="relative flex h-4 w-4 shrink-0 items-center justify-center"');
    expect(navbar).toContain("theme-toggle-icon absolute h-4 w-4");
    expect(navbar).toContain("motion-reduce:transform-none motion-reduce:transition-none");
    expect(navbar).toContain('theme === "dark" ? "rotate-0 scale-100 opacity-100"');
    expect(styles).toContain(".theme-switching .theme-toggle-icon");
    expect(styles).toContain("transition-duration: 200ms !important");
  });
});
