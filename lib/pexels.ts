export async function searchPexelsImage(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || apiKey === "your_pexels_api_key_here") {
    return null;
  }

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      {
        headers: { Authorization: apiKey },
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.medium;
    }
    return null;
  } catch {
    return null;
  }
}
