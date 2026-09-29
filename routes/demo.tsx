/**
 * /demo — Roll a random pop-culture or twisted demo board into storage and open it.
 */

import { Head } from "$fresh/runtime.ts";
import DemoSeedIsland from "../islands/DemoSeedIsland.tsx";

export default function DemoPage() {
  return (
    <>
      <Head>
        <title>Demo — ProMapper</title>
        <meta
          name="description"
          content="A finished ProMapper board: pop-culture debates and town hall chaos, mapped."
        />
      </Head>
      <main style={{ minHeight: "100vh" }}>
        <DemoSeedIsland />
      </main>
    </>
  );
}
