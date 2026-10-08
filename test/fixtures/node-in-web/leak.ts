// Not app code: what a Node API leaking into web/src looks like. test/tsconfig.test.ts
// expects the browser project to refuse both lines.
export const home = process.env.HOME;
export const bytes = Buffer.from("fish");
