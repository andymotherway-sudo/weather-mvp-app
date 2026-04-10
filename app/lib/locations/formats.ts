// app/lib/locations/format.ts

export const US_STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};

export const COUNTRY_ABBR: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'UK',
  Canada: 'CA',
  Mexico: 'MX',
  France: 'FR',
  Germany: 'DE',
  Spain: 'ES',
  Italy: 'IT',
};

export function formatCompactLocation(loc: {
  name: string;
  admin1?: string;
  country?: string;
}) {
  const isUS = loc.country?.toLowerCase().includes('united states');

  const state = loc.admin1
    ? US_STATE_ABBR[loc.admin1] ?? loc.admin1
    : undefined;

  const country = loc.country
    ? COUNTRY_ABBR[loc.country] ?? loc.country
    : undefined;

  return [
    loc.name,
    state,
    isUS ? undefined : country, // 🔥 hide US
  ]
    .filter(Boolean)
    .join(', ');
}