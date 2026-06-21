import { ensureApiSession } from "./apiAuth.ts";
import { enqueueApiRequest } from "./requestQueue.ts";

/**
 * Markdown Service
 *
 * Client-side service that calls the server markdown endpoint.
 * Provider-agnostic: the server picks the active AI provider.
 * API keys stay server-side, never exposed to the client.
 */

export const markdownService = {
  /**
   * Generate markdown from conversation text using a custom prompt
   */
  async generateMarkdown(prompt: string, text: string): Promise<string> {
    try {
      console.log("📝 Generating markdown");

      await ensureApiSession();
      const data = await enqueueApiRequest(async ({ signal }) => {
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, text }),
          signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to generate markdown");
        }

        return response.json();
      });
      console.log("✅ Markdown generation complete");
      return data.markdown;
    } catch (error) {
      console.error("❌ Error generating markdown:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to generate markdown",
      );
    }
  },
};
