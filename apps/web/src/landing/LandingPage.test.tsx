// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("marketing origin boundary", () => {
  it("explores synthetic coverage without reading owner authority or making API calls", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<LandingPage appOrigin="https://app.example.test" />);
    expect(screen.getByText("Synthetic sample")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tires" }));
    expect(screen.getByText("Partial coverage")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Underbody" }));
    expect(screen.getByText("Not assessed")).toBeTruthy();
    expect(
      screen.getByText(/There is no condition finding or score/),
    ).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("routes every product CTA directly to the configured origin without session or tracking parameters", () => {
    const { container } = render(
      <LandingPage appOrigin="https://app.example.test" />,
    );
    const external = [
      ...container.querySelectorAll<HTMLAnchorElement>("a"),
    ].filter((link) => !link.getAttribute("href")?.startsWith("#"));
    expect(external).toHaveLength(4);
    for (const link of external)
      expect(link.getAttribute("href")).toBe("https://app.example.test");
    for (const link of container.querySelectorAll<HTMLAnchorElement>(
      'a[href^="#"]',
    )) {
      const fragment = link.getAttribute("href")!.slice(1);
      if (fragment) expect(document.getElementById(fragment)).not.toBeNull();
    }
  });
});
