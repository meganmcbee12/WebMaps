const aliases = { la: "Los Angeles", sf: "San Francisco", sd: "San Diego" };
export async function findPlaces(input, fetchImpl = fetch) {
  const query = (aliases[input.trim().toLowerCase()] || input.trim()).slice(
    0,
    300,
  );
  if (query.length < 3)
    throw new Error("Enter a California town or a full street address.");
  const options = {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  };
  if (/\d/.test(query)) {
    const url = new URL(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    );
    url.search = new URLSearchParams({
      address: query,
      benchmark: "Public_AR_Current",
      format: "json",
    }).toString();
    const response = await fetchImpl(url, options);
    if (!response.ok)
      throw Error(
        "The address service is unavailable. Try a town name or pick a point on the map.",
      );
    const data = await response.json();
    return (data.result?.addressMatches || [])
      .filter(
        (x) =>
          x.addressComponents?.state === "CA" &&
          Number.isFinite(x.coordinates?.x) &&
          Number.isFinite(x.coordinates?.y),
      )
      .slice(0, 8)
      .map((x) => ({
        name: x.matchedAddress,
        longitude: x.coordinates.x,
        latitude: x.coordinates.y,
        source: "US Census Geocoder",
      }));
  }
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query,
    count: "20",
    language: "en",
    format: "json",
    countryCode: "US",
  }).toString();
  const response = await fetchImpl(url, options);
  if (!response.ok)
    throw Error(
      "The place search is unavailable. Pick a point on the map instead.",
    );
  const data = await response.json();
  return (data.results || [])
    .filter(
      (x) =>
        x.country_code === "US" &&
        x.admin1 === "California" &&
        Number.isFinite(x.longitude) &&
        Number.isFinite(x.latitude),
    )
    .slice(0, 8)
    .map((x) => ({
      name: [x.name, x.admin2, "California"].filter(Boolean).join(", "),
      longitude: x.longitude,
      latitude: x.latitude,
      source: "GeoNames / Open-Meteo",
    }));
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end(JSON.stringify({ error: "Use GET." }));
  }
  const query =
    new URL(req.url, "http://localhost").searchParams.get("q") || "";
  if (query.length < 2 || query.length > 300) {
    res.statusCode = 400;
    return res.end(
      JSON.stringify({
        error: "Enter a town or address (up to 300 characters).",
      }),
    );
  }
  try {
    res.statusCode = 200;
    res.end(JSON.stringify({ results: await findPlaces(query) }));
  } catch (error) {
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        error: error.message || "Place search is unavailable.",
      }),
    );
  }
}
