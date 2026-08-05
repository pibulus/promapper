/**
 * /example — drop a finished map into local storage and open it.
 *
 * The hero asks a cold visitor for effort before showing them anything, which
 * is the wrong way round ("you can't receive what you can't perceive"). This is
 * the other half: one finished board, landed in, immediately.
 *
 * NOT the old Demo button. That one faked a pipeline run — canned data behind
 * staged loading and confetti, pretending the AI had just worked. This does no
 * pretending: it writes a conversation someone already made and opens it. The
 * example is labelled as an example and is deletable like any other map.
 */

import { Head } from "$fresh/runtime.ts";
import DemoSeedIsland from "../islands/DemoSeedIsland.tsx";

export default function ExamplePage() {
  return (
    <>
      <Head>
        <title>An example map — ProMapper</title>
        <meta
          name="description"
          content="A finished ProMapper board: a rural sheriff's third callout this week, mapped."
        />
      </Head>
      <main style={{ minHeight: "100vh" }}>
        <DemoSeedIsland />
      </main>
    </>
  );
}
