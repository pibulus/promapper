import { Head } from "$fresh/runtime.ts";

export default function Error500() {
  return (
    <>
      <Head>
        <title>Something broke | ProMapper</title>
        <meta
          name="description"
          content="The server hit a snag — but your maps are safe."
        />
      </Head>
      <div class="mapper-scene min-h-screen flex items-center justify-center px-6">
        <div class="shared-panel max-w-md">
          <div class="shared-panel__icon">
            <i class="fa fa-wrench" aria-hidden="true"></i>
          </div>
          <h2 class="shared-panel__title">Something broke</h2>
          <p class="shared-panel__body mb-6">
            The server hit a snag while handling your request. Your maps and
            data are safe — this is just a temporary hiccup. Try refreshing the
            page, or head back home and give it another go.
          </p>
          <a href="/" class="btn btn--accent">
            Go to Home
          </a>
        </div>
      </div>
    </>
  );
}
