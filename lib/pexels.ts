export type PexelsSearchResult =
  | { ok: true; imageUrl: string }
  | {
      ok: false;
      code: "unconfigured" | "timeout" | "http_error" | "no_results" | "error";
      message: string;
    };

export function isPexelsConfigured() {
  const apiKey = process.env.PEXELS_API_KEY;
  return Boolean(apiKey && apiKey !== "your_key_here");
}

export async function searchPexelsImage(
  query: string
): Promise<PexelsSearchResult> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!isPexelsConfigured() || !apiKey) {
    return {
      ok: false,
      code: "unconfigured",
      message: "Pexels API key is not configured",
    };
  }

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        code: "http_error",
        message: `Pexels request failed with HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return { ok: true, imageUrl: data.photos[0].src.medium };
    }
    return {
      ok: false,
      code: "no_results",
      message: "No matching image was found",
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return {
        ok: false,
        code: "timeout",
        message: "Image search timed out",
      };
    }
    return {
      ok: false,
      code: "error",
      message: "Image search failed",
    };
  }
}
