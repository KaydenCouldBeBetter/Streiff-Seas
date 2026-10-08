import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildInfo } from "../web/build-info";
import { App } from "../web/src/App";

describe("the app under test", () => {
  it("loads with the build's constants defined and shows the short sha in the footer", () => {
    const shortSha = buildInfo(process.env, new Date()).sha.slice(0, 7);

    expect(renderToStaticMarkup(createElement(App))).toContain(`<footer>Build ${shortSha}</footer>`);
  });
});
