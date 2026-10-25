import type { ReactNode } from "react";

const shortSha = __BUILD_SHA__.slice(0, 7);

/**
 * The page shell: the current screen, then the build footer. The screens come in from
 * main.tsx, so this module stays free of DOM code (tests import it under Node types).
 */
export function App({ children }: { children?: ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <footer>Build {shortSha}</footer>
    </>
  );
}
