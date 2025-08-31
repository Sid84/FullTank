// Consumer read API not publicly documented at time of writing.
// VIC mandates retailer reporting starting Aug 6, 2025 via Service Victoria; public viewing via the app later in 2025.
// Until public read access is available, return [] (or feed crowd/aggregator).
export async function vicFetch({ q, fuel }) {
    return [];
  }
  