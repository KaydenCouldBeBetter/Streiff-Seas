const shortSha = __BUILD_SHA__.slice(0, 7);

export function App() {
  return (
    <>
      <main>
        <h1>Chromie Fishing</h1>
        <p>The scoreboard is being built.</p>
      </main>
      <footer>Build {shortSha}</footer>
    </>
  );
}
