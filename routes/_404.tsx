import { Head } from "$fresh/runtime.ts";

export default function Error404() {
  return (
    <>
      <Head>
        <title>Hmm, that page wandered off | ProMapper</title>
        <meta
          name="description"
          content="This page isn't here — but your project map is one click away."
        />
      </Head>
      <div class="mapper-scene min-h-screen flex items-center justify-center px-6">
        <div class="shared-panel max-w-md">
          <div class="shared-panel__icon">
            <i class="fa fa-compass" aria-hidden="true"></i>
          </div>
          <h2 class="shared-panel__title">This page wandered off</h2>
          <p class="shared-panel__body mb-6">
            We looked, but there's nothing at this spot. It may have moved, or
            the link picked up a typo somewhere. No harm done — let's get you
            back on the map.
          </p>
          <a href="/" class="btn btn--accent">
            Go to Home
          </a>
        </div>
      </div>
    </>
  );
}
