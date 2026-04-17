import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/common/Glass';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { geocodePlaces } from '../lib/locations/geocode';
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { fetchWithTimeout } from '../lib/net/fetchWithTimeout';

type Mode = 'station' | 'flight';
type ReportView = 'decoded' | 'raw';
type Stop = { raw: string; code?: string; label: string; lat: number; lon: number };
type Wx = { tempF: number | null; windMph: number | null; gustMph: number | null; cloudPct: number | null; visMi: number | null };
type Sample = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  distanceMi: number;
  weather: Wx;
  hazards: { turbulence: boolean; icing: boolean; sigmet: boolean; cwa: boolean; pirep: boolean };
  severity: 'low' | 'elevated' | 'high';
};
type Flight = { origin: Stop; destination: Stop; totalDistanceMi: number; samples: Sample[]; counts: Record<string, number> };
type Station = { station: Stop; metar: any | null; taf: any | null };

const DEFAULT_REGION: Region = { latitude: 39.5, longitude: -98.35, latitudeDelta: 20, longitudeDelta: 28, zoom: 4 };
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as any[] };

const num = (...xs: any[]) => {
  for (const x of xs) {
    const n = typeof x === 'string' ? Number(x) : x;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
};
const str = (...xs: any[]) => {
  for (const x of xs) if (typeof x === 'string' && x.trim()) return x.trim();
  return null;
};
const fmt = (v: number | null | undefined, s = '', d = 0) =>
  v == null || !Number.isFinite(v) ? '--' : `${v.toFixed(d)}${s}`;
const milesFromMaybeMeters = (v: number | null) =>
  v == null || !Number.isFinite(v) ? null : v > 1000 ? v / 1609.344 : v;
const mi = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = 3958.7613;
  const toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
};
const bounds = (pts: Array<{ lat: number; lon: number }>) => ({
  west: Math.min(...pts.map((p) => p.lon)),
  east: Math.max(...pts.map((p) => p.lon)),
  south: Math.min(...pts.map((p) => p.lat)),
  north: Math.max(...pts.map((p) => p.lat)),
});
const region = (pts: Array<{ lat: number; lon: number }>): Region => {
  const b = bounds(pts);
  return {
    latitude: (b.south + b.north) / 2,
    longitude: (b.west + b.east) / 2,
    latitudeDelta: Math.max(2.4, (b.north - b.south) * 1.8),
    longitudeDelta: Math.max(3, (b.east - b.west) * 1.6),
  };
};
const expand = (b: any, pad: number) => ({ west: b.west - pad, east: b.east + pad, south: b.south - pad, north: b.north + pad });
const intersects = (a: any, b: any) => !(a.east < b.west || a.west > b.east || a.north < b.south || a.south > b.north);
const rows = (json: any) => (Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : json ? [json] : []);
function coordsOf(input: any, out: Array<[number, number]>) {
  if (!Array.isArray(input) || !input.length) return;
  if (input.length >= 2 && Number.isFinite(input[0]) && Number.isFinite(input[1])) {
    out.push([Number(input[0]), Number(input[1])]);
    return;
  }
  input.forEach((c) => coordsOf(c, out));
}
function featureBounds(f: any) {
  const out: Array<[number, number]> = [];
  coordsOf(f?.geometry?.coordinates, out);
  if (!out.length) return null;
  return {
    west: Math.min(...out.map((c) => c[0])),
    east: Math.max(...out.map((c) => c[0])),
    south: Math.min(...out.map((c) => c[1])),
    north: Math.max(...out.map((c) => c[1])),
  };
}

function airportCandidates(token: string) {
  const raw = token.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(raw)) return [];
  return Array.from(new Set(/^[A-Z]{3}$/.test(raw) ? [raw, `K${raw}`] : [raw]));
}

async function resolveAirport(token: string): Promise<Stop | null> {
  for (const id of airportCandidates(token)) {
    try {
      const r = await fetchWithTimeout(
        `https://aviationweather.gov/api/data/airport?ids=${encodeURIComponent(id)}&format=json`,
        10000,
        { headers: { Accept: 'application/json' } }
      );
      if (!r.ok) continue;
      for (const row of rows(await r.json().catch(() => null))) {
        const lat = num(row?.lat, row?.latitude, row?.geometry?.coordinates?.[1]);
        const lon = num(row?.lon, row?.longitude, row?.geometry?.coordinates?.[0]);
        if (lat == null || lon == null) continue;
        const code = String(row?.icaoId ?? row?.icao ?? row?.ident ?? row?.id ?? id).toUpperCase();
        const label = String(row?.name ?? row?.site ?? row?.city ?? code).trim() || code;
        return { raw: token, code, label, lat, lon };
      }
    } catch {}
  }
  return null;
}

async function resolveStop(token: string): Promise<Stop> {
  const airport = await resolveAirport(token);
  if (airport) return airport;
  const place = (await geocodePlaces(token))[0];
  if (!place) throw new Error(`Could not resolve "${token}"`);
  return { raw: token, label: [place.name, place.admin1, place.country].filter(Boolean).join(', '), lat: place.lat, lon: place.lon };
}

async function resolveStation(token: string) {
  const airport = await resolveAirport(token);
  if (!airport) throw new Error(`Could not resolve airport "${token}"`);
  return airport;
}

async function fetchWx(lat: number, lon: number): Promise<Wx> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_gusts_10m,cloud_cover` +
    `&hourly=visibility&forecast_days=1&temperature_unit=fahrenheit&windspeed_unit=mph&visibility_unit=mile&timezone=auto`;
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) throw new Error(`Route weather fetch failed (${r.status})`);
  const j = await r.json();
  const c = j?.current ?? {};
  const vis = Array.isArray(j?.hourly?.visibility) ? j.hourly.visibility[0] : null;
  return {
    tempF: num(c?.temperature_2m),
    windMph: num(c?.wind_speed_10m),
    gustMph: num(c?.wind_gusts_10m),
    cloudPct: num(c?.cloud_cover),
    visMi: milesFromMaybeMeters(num(vis)),
  };
}

async function fetchProduct(kind: 'metar' | 'taf', code: string) {
  const r = await fetchWithTimeout(
    `https://aviationweather.gov/api/data/${kind}?ids=${encodeURIComponent(code)}&format=json`,
    10000,
    { headers: { Accept: 'application/json' } }
  );
  if (!r.ok) return null;
  return rows(await r.json().catch(() => null))[0] ?? null;
}

const metarRaw = (row: any) => str(row?.rawOb, row?.raw_text, row?.raw, row?.metar, row?.observation);
const tafRaw = (row: any) => str(row?.rawTAF, row?.raw_text, row?.raw, row?.taf);
const visibilityMiles = (row: any) => {
  const direct = num(row?.visib, row?.visibility, row?.visibility_statute_mi, row?.visibility_mi, row?.vis);
  if (direct != null) return direct;
  const meters = num(row?.visibility_meters, row?.visibility_m);
  return meters == null ? null : meters / 1609.344;
};
const ceilingFeet = (row: any) => {
  const direct = num(row?.ceiling, row?.ceiling_ft_agl, row?.ceilingFtAgl);
  if (direct != null) return direct;
  const cloudBases = [
    ...(Array.isArray(row?.clouds) ? row.clouds : []),
    ...(Array.isArray(row?.skyCover) ? row.skyCover : []),
    ...(Array.isArray(row?.sky_condition) ? row.sky_condition : []),
  ]
    .filter((c: any) => {
      const cover = str(c?.cover, c?.sky_cover, c?.type)?.toUpperCase();
      return cover === 'BKN' || cover === 'OVC' || cover === 'VV';
    })
    .map((c: any) => num(c?.base, c?.base_ft_agl, c?.cloud_base_ft_agl))
    .filter((v: any) => v != null) as number[];
  return cloudBases.length ? Math.min(...cloudBases) : null;
};
const flightCat = (row: any) => {
  const direct = str(row?.flight_category, row?.flightCategory, row?.category);
  if (direct) return direct;
  const vis = visibilityMiles(row);
  const ceil = ceilingFeet(row);
  if (vis == null && ceil == null) return null;
  if ((ceil != null && ceil < 500) || (vis != null && vis < 1)) return 'LIFR';
  if ((ceil != null && ceil < 1000) || (vis != null && vis < 3)) return 'IFR';
  if ((ceil != null && ceil <= 3000) || (vis != null && vis <= 5)) return 'MVFR';
  return 'VFR';
};
const windText = (row: any) => {
  const d = num(row?.wdir, row?.wind_dir_degrees, row?.windDirection);
  const s = num(row?.wspd, row?.wind_speed_kt, row?.windSpeedKt);
  const g = num(row?.wgst, row?.wind_gust_kt, row?.windGustKt);
  return d == null && s == null && g == null
    ? '--'
    : `${d == null ? 'VRB' : `${Math.round(d)}°`} / ${s == null ? '--' : `${Math.round(s)} kt`}${g == null ? '' : ` G${Math.round(g)}`}`;
};
const tempDew = (row: any) => {
  const t = num(row?.temp, row?.tempC, row?.temperature_c);
  const d = num(row?.dewp, row?.dewpointC, row?.dewpoint_c);
  return t == null && d == null ? '--' : `${t == null ? '--' : `${Math.round(t)}C`} / ${d == null ? '--' : `${Math.round(d)}C`}`;
};
const altim = (row: any) => {
  const a = num(row?.altim, row?.altimeter, row?.altimeter_in_hg, row?.altimeter_hpa);
  return a == null ? '--' : a > 100 ? `${a.toFixed(0)} hPa` : `${a.toFixed(2)} inHg`;
};
const visText = (row: any) => {
  const v = visibilityMiles(row);
  return v == null ? '--' : `${v < 10 ? v.toFixed(1) : v.toFixed(0)} sm`;
};
const ceilText = (row: any) => {
  const c = ceilingFeet(row);
  if (c != null) return `${Math.round(c)} ft`;
  const clouds = [
    ...(Array.isArray(row?.clouds) ? row.clouds : []),
    ...(Array.isArray(row?.skyCover) ? row.skyCover : []),
    ...(Array.isArray(row?.sky_condition) ? row.sky_condition : []),
  ];
  return clouds.length ? 'No ceiling detected' : '--';
};
const tafSummary = (row: any) => {
  const raw = tafRaw(row);
  if (!raw) return '--';
  return raw
    .replace(/^TAF\s+[A-Z0-9]+\s+\d{6}Z?\s*/i, '')
    .trim()
    .replace(/\bFM(\d{6})\b/g, 'From $1Z')
    .replace(/\bTEMPO\b/g, 'Tempo')
    .replace(/\bBECMG\b/g, 'Becoming')
    .replace(/\bPROB30\b/g, '30% chance')
    .replace(/\bPROB40\b/g, '40% chance');
};

export default function AviationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const aviation = useAviationMapData(true);
  const [mode, setMode] = useState<Mode>('station');
  const [reportView, setReportView] = useState<ReportView>('decoded');
  const [stationInput, setStationInput] = useState('KPHX');
  const [fromInput, setFromInput] = useState('KPHX');
  const [toInput, setToInput] = useState('KDEN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [learnVisible, setLearnVisible] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const openLearn = (id: string) => {
    setLearnTopicId(id);
    setLearnVisible(true);
  };

  const openMap = () => {
    if (mode === 'station' && station) {
      router.push({ pathname: '/maps', params: { view: 'aviation', focus: 'once', lat: String(station.station.lat), lon: String(station.station.lon), label: station.station.code ?? station.station.label } });
      return;
    }
    if (mode === 'flight' && flight) {
      const c = region(flight.samples);
      router.push({ pathname: '/maps', params: { view: 'aviation', focus: 'once', lat: String(c.latitude), lon: String(c.longitude), label: `${flight.origin.code ?? flight.origin.label} to ${flight.destination.code ?? flight.destination.label}` } });
      return;
    }
    router.push({ pathname: '/maps', params: { view: 'aviation' } });
  };

  const loadStation = async () => {
    if (!stationInput.trim()) {
      setError('Enter an airport station code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await resolveStation(stationInput.trim());
      const code = s.code ?? s.raw.trim().toUpperCase();
      const [metar, taf] = await Promise.all([fetchProduct('metar', code), fetchProduct('taf', code)]);
      setStation({ station: s, metar, taf });
      setFlight(null);
      setMapRegion({ latitude: s.lat, longitude: s.lon, latitudeDelta: 3, longitudeDelta: 3, zoom: 6 });
    } catch (err: any) {
      setStation(null);
      setError(err?.message ?? 'Unable to load station data.');
    } finally {
      setLoading(false);
    }
  };

  const analyzeFlight = async () => {
    if (!fromInput.trim() || !toInput.trim()) {
      setError('Enter both a From and To airport or place.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [origin, destination] = await Promise.all([resolveStop(fromInput.trim()), resolveStop(toInput.trim())]);
      const totalDistanceMi = mi(origin.lat, origin.lon, destination.lat, destination.lon);
      const count = Math.max(4, Math.min(9, Math.round(totalDistanceMi / 120) + 1));
      const pts = Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0 : i / (count - 1);
        return {
          key: `pt-${i}`,
          label: i === 0 ? `Depart ${origin.code ?? origin.label.split(',')[0]}` : i === count - 1 ? `Arrive ${destination.code ?? destination.label.split(',')[0]}` : `${Math.round(t * 100)}%`,
          lat: origin.lat + (destination.lat - origin.lat) * t,
          lon: origin.lon + (destination.lon - origin.lon) * t,
          distanceMi: totalDistanceMi * t,
        };
      });
      const corridor = expand(bounds(pts), 1.2);
      const wx = await Promise.all(pts.map((p) => fetchWx(p.lat, p.lon)));
      const samples: Sample[] = pts.map((p, i) => {
        const box = { west: p.lon, east: p.lon, south: p.lat, north: p.lat };
        const hazards = {
          turbulence: aviation.turbulence.features.some((f) => { const b = featureBounds(f); return b ? intersects(expand(b, 0.75), box) : false; }),
          icing: aviation.icing.features.some((f) => { const b = featureBounds(f); return b ? intersects(expand(b, 0.75), box) : false; }),
          sigmet: aviation.advisories.features.some((f) => { const b = featureBounds(f); return b ? intersects(expand(b, 0.65), box) : false; }),
          cwa: aviation.centerWeather.features.some((f) => { const b = featureBounds(f); return b ? intersects(expand(b, 0.55), box) : false; }),
          pirep: aviation.pireps.features.some((f) => { const c = f?.geometry?.coordinates; return Array.isArray(c) && c.length >= 2 && mi(p.lat, p.lon, Number(c[1]), Number(c[0])) <= 65; }),
        };
        const score =
          (hazards.sigmet ? 3 : 0) +
          (hazards.turbulence ? 2 : 0) +
          (hazards.icing ? 2 : 0) +
          (hazards.cwa ? 1 : 0) +
          (hazards.pirep ? 1 : 0) +
          ((wx[i].gustMph ?? 0) >= 30 ? 1 : 0) +
          ((wx[i].visMi ?? 10) < 3 ? 1 : 0);
        return { ...p, weather: wx[i], hazards, severity: score >= 4 ? 'high' : score >= 2 ? 'elevated' : 'low' };
      });
      setFlight({
        origin,
        destination,
        totalDistanceMi,
        samples,
        counts: {
          turbulence: aviation.turbulence.features.filter((f) => { const b = featureBounds(f); return b ? intersects(b, corridor) : false; }).length,
          icing: aviation.icing.features.filter((f) => { const b = featureBounds(f); return b ? intersects(b, corridor) : false; }).length,
          sigmet: aviation.advisories.features.filter((f) => { const b = featureBounds(f); return b ? intersects(b, corridor) : false; }).length,
          cwa: aviation.centerWeather.features.filter((f) => { const b = featureBounds(f); return b ? intersects(b, corridor) : false; }).length,
          pirep: aviation.pireps.features.filter((f) => { const c = f?.geometry?.coordinates; return Array.isArray(c) && c.length >= 2 && intersects(expand({ west: Number(c[0]), east: Number(c[0]), south: Number(c[1]), north: Number(c[1]) }, 0.55), corridor); }).length,
        },
      });
      setStation(null);
      setMapRegion(region(pts));
    } catch (err: any) {
      setFlight(null);
      setError(err?.message ?? 'Unable to analyze this route.');
    } finally {
      setLoading(false);
    }
  };

  const routeLine = useMemo(() => flight ? ({ type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: flight.samples.map((p) => [p.lon, p.lat]) } }] }) : EMPTY_FC, [flight]);
  const routePts = useMemo(() => flight ? ({ type: 'FeatureCollection' as const, features: flight.samples.map((p) => ({ type: 'Feature' as const, id: p.key, properties: { label: p.label, severity: p.severity }, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } })) }) : EMPTY_FC, [flight]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Glass style={s.hero}>
          <Text style={s.eyebrow}>AVIATION</Text>
          <Text style={s.title}>Aviation weather</Text>
          <Text style={s.subtitle}>Pilots can load station reports. Travelers can analyze a route and jump into the aviation map.</Text>
          <View style={s.mode}><Seg onPress={() => setMode('station')} active={mode === 'station'} label="Station" /><Seg onPress={() => setMode('flight')} active={mode === 'flight'} label="Flight" /></View>

          {mode === 'station' ? (
            <>
              <Label text="Airport" />
              <TextInput value={stationInput} onChangeText={setStationInput} autoCapitalize="characters" autoCorrect={false} placeholder="KPHX or PHX" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
              <View style={s.actions}><Primary onPress={loadStation} label="Load Station" loading={loading} /><Secondary onPress={openMap} label="Open Aviation Map" /></View>
              <View style={s.learnRow}><Learn onPress={() => openLearn('aviation-metar')} label="METAR" /><Learn onPress={() => openLearn('aviation-taf')} label="TAF" /><Learn onPress={() => openLearn('aviation-flight-category')} label="Flight Cat" /></View>
            </>
          ) : (
            <>
              <Label text="From" /><TextInput value={fromInput} onChangeText={setFromInput} autoCapitalize="characters" autoCorrect={false} placeholder="KPHX or Phoenix" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
              <Label text="To" /><TextInput value={toInput} onChangeText={setToInput} autoCapitalize="characters" autoCorrect={false} placeholder="KDEN or Denver" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
              <View style={s.actions}><Primary onPress={analyzeFlight} label="Analyze Flight" loading={loading} /><Secondary onPress={openMap} label="Open Aviation Map" /></View>
              <View style={s.learnRow}><Learn onPress={() => openLearn('aviation-turbulence')} label="Turbulence" /><Learn onPress={() => openLearn('aviation-icing')} label="Icing" /><Learn onPress={() => openLearn('aviation-pirep')} label="PIREPs" /></View>
            </>
          )}

          <Text style={s.helper}>Three- and four-letter airport codes are supported. US three-letter inputs also try the matching K-prefixed station.</Text>
          <Text style={[s.summary, error ? s.error : null]}>{error ?? (mode === 'station' ? station ? `Loaded ${station.station.code ?? station.station.label}.` : 'Enter a station to load raw and decoded aviation weather.' : flight ? `${flight.samples.filter((x) => x.severity === 'high').length} high-concern segments, ${flight.samples.filter((x) => x.severity === 'elevated').length} elevated.` : 'Enter a route to scan the corridor.')}</Text>
        </Glass>

        {mode === 'station' && station ? (
          <>
            <View style={s.modeAlt}><Seg onPress={() => setReportView('decoded')} active={reportView === 'decoded'} label="Decoded" /><Seg onPress={() => setReportView('raw')} active={reportView === 'raw'} label="Raw" /></View>
            <Glass style={s.card}>
              <View style={s.cardHead}><View><Text style={s.cardTitle}>{station.station.code ?? station.station.label}</Text><Text style={s.cardSub}>{station.station.label}</Text></View><Learn onPress={() => openLearn('aviation-metar')} label="Learn" /></View>
              <Row label="Flight Category" value={flightCat(station.metar) ?? '--'} />
              <Row label="Wind" value={windText(station.metar)} />
              <Row label="Visibility" value={visText(station.metar)} />
              <Row label="Ceiling" value={ceilText(station.metar)} />
              <Row label="Temperature / Dew Point" value={tempDew(station.metar)} />
              <Row label="Altimeter" value={altim(station.metar)} />
            </Glass>
            {reportView === 'decoded' ? (
              <>
                <Glass style={s.card}><View style={s.cardHead}><Text style={s.cardTitle}>Decoded METAR</Text><Learn onPress={() => openLearn('aviation-metar')} label="METAR" /></View><Text style={s.raw}>{`${flightCat(station.metar) ?? 'Unknown'} conditions. Wind ${windText(station.metar)}. Visibility ${visText(station.metar)}. Ceiling ${ceilText(station.metar)}. Temperature / Dew Point ${tempDew(station.metar)}. Altimeter ${altim(station.metar)}.`}</Text></Glass>
                <Glass style={s.card}><View style={s.cardHead}><Text style={s.cardTitle}>Decoded TAF</Text><Learn onPress={() => openLearn('aviation-taf')} label="TAF" /></View><Text style={s.raw}>{tafSummary(station.taf)}</Text></Glass>
              </>
            ) : (
              <>
                <Glass style={s.card}><Text style={s.cardTitle}>Raw METAR</Text><Text style={s.raw}>{metarRaw(station.metar) ?? 'No METAR returned.'}</Text></Glass>
                <Glass style={s.card}><Text style={s.cardTitle}>Raw TAF</Text><Text style={s.raw}>{tafRaw(station.taf) ?? 'No TAF returned.'}</Text></Glass>
              </>
            )}
          </>
        ) : null}

        {mode === 'flight' ? (
          <>
            <Glass style={s.card}><Text style={s.cardTitle}>Route map</Text><View style={s.map}>
              <MapRenderer key={flight ? `${flight.origin.code ?? flight.origin.label}-${flight.destination.code ?? flight.destination.label}` : 'empty'} engine="maplibre" initialRegion={mapRegion} mapStyle="dark" boundaryReliefTone="teal" onPanDrag={() => {}} onRegionChangeComplete={() => {}} radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }} overlays={[]}>
                <MapLibreGL.ShapeSource id="route-line" shape={routeLine as any}><MapLibreGL.LineLayer id="route-line-layer" style={{ lineColor: '#f8fafc', lineWidth: 3, lineOpacity: 0.92 }} /></MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="route-pts" shape={routePts as any}>
                  <MapLibreGL.CircleLayer id="route-pts-layer" style={{ circleColor: ['match', ['get', 'severity'], 'high', '#ef4444', 'elevated', '#f59e0b', '#22c55e'] as any, circleRadius: 5, circleStrokeColor: 'rgba(2,6,23,0.98)', circleStrokeWidth: 1.5 }} />
                  <MapLibreGL.SymbolLayer id="route-labels" style={{ textField: ['get', 'label'], textSize: 10, textColor: '#e5e7eb', textHaloColor: 'rgba(2,6,23,0.98)', textHaloWidth: 1, textOffset: [0, 1.2], textAnchor: 'top' }} />
                </MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="turb" shape={aviation.turbulence as any}><MapLibreGL.FillLayer id="turb-fill" style={{ fillColor: '#f59e0b', fillOpacity: 0.18 }} /><MapLibreGL.LineLayer id="turb-line" style={{ lineColor: '#fbbf24', lineWidth: 1.5, lineOpacity: 0.7 }} /></MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="ice" shape={aviation.icing as any}><MapLibreGL.FillLayer id="ice-fill" style={{ fillColor: '#38bdf8', fillOpacity: 0.16 }} /><MapLibreGL.LineLayer id="ice-line" style={{ lineColor: '#7dd3fc', lineWidth: 1.5, lineOpacity: 0.68 }} /></MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="sigmet" shape={aviation.advisories as any}><MapLibreGL.LineLayer id="sigmet-line" style={{ lineColor: '#f87171', lineWidth: 2, lineOpacity: 0.78, lineDasharray: [2, 1.4] }} /></MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="cwa" shape={aviation.centerWeather as any}><MapLibreGL.LineLayer id="cwa-line" style={{ lineColor: '#fde68a', lineWidth: 1.7, lineOpacity: 0.72, lineDasharray: [1.2, 1.2] }} /></MapLibreGL.ShapeSource>
                <MapLibreGL.ShapeSource id="pirep" shape={aviation.pireps as any}><MapLibreGL.CircleLayer id="pirep-layer" style={{ circleColor: '#e0f2fe', circleOpacity: 0.88, circleRadius: 3.5, circleStrokeColor: 'rgba(2,6,23,0.98)', circleStrokeWidth: 1 }} /></MapLibreGL.ShapeSource>
              </MapRenderer>
            </View></Glass>
            <View style={s.stats}><Stat label="Distance" value={flight ? fmt(flight.totalDistanceMi, ' mi') : '--'} /><Stat label="Turb" value={flight ? String(flight.counts.turbulence) : '--'} /><Stat label="Icing" value={flight ? String(flight.counts.icing) : '--'} /><Stat label="SIGMET" value={flight ? String(flight.counts.sigmet) : '--'} /></View>
            <View style={s.stats}><Stat label="CWA" value={flight ? String(flight.counts.cwa) : '--'} /><Stat label="PIREPs" value={flight ? String(flight.counts.pirep) : '--'} /><Stat label="From" value={flight ? (flight.origin.code ?? flight.origin.label.split(',')[0]) : '--'} /><Stat label="To" value={flight ? (flight.destination.code ?? flight.destination.label.split(',')[0]) : '--'} /></View>
            {flight?.samples.map((x) => <Glass key={x.key} style={s.card}><View style={s.cardHead}><View><Text style={s.cardTitle}>{x.label}</Text><Text style={s.cardSub}>{fmt(x.distanceMi, ' mi')} from departure</Text></View><View style={[s.pill, x.severity === 'high' ? s.high : x.severity === 'elevated' ? s.elevated : s.low]}><Text style={s.pillText}>{x.severity.toUpperCase()}</Text></View></View><Text style={s.raw}>Temp {fmt(x.weather.tempF, ' deg')} / Wind {fmt(x.weather.windMph, ' mph')} / Gust {fmt(x.weather.gustMph, ' mph')} / Clouds {fmt(x.weather.cloudPct, '%')} / Visibility {fmt(x.weather.visMi, ' mi', x.weather.visMi != null && x.weather.visMi < 10 ? 1 : 0)}</Text><Text style={[s.raw, { marginTop: 10 }]}>Hazards: {x.hazards.turbulence ? 'Turb ' : ''}{x.hazards.icing ? 'Ice ' : ''}{x.hazards.sigmet ? 'SIGMET ' : ''}{x.hazards.cwa ? 'CWA ' : ''}{x.hazards.pirep ? 'PIREP' : ''}{!x.hazards.turbulence && !x.hazards.icing && !x.hazards.sigmet && !x.hazards.cwa && !x.hazards.pirep ? 'None nearby' : ''}</Text></Glass>)}
          </>
        ) : null}

        <LearnMoreModal visible={learnVisible} onClose={() => setLearnVisible(false)} initialTopicId={learnTopicId} />
      </ScrollView>
    </SafeAreaView>
  );
}
function Label({ text }: { text: string }) { return <Text style={s.label}>{text}</Text>; }
function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[s.seg, active ? s.segOn : null]}><Text style={[s.segText, active ? s.segTextOn : null]}>{label}</Text></Pressable>; }
function Learn({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={s.learn}><Text style={s.learnText}>{label}</Text></Pressable>; }
function Primary({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) { return <Pressable onPress={onPress} disabled={loading} style={[s.primary, loading ? s.dim : null]}>{loading ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{label}</Text>}</Pressable>; }
function Secondary({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={s.secondary}><Text style={s.secondaryText}>{label}</Text></Pressable>; }
function Stat({ label, value }: { label: string; value: string }) { return <Glass style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></Glass>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#071120' },
  hero: { borderRadius: 24, padding: 14 },
  eyebrow: { color: 'rgba(125,211,252,0.88)', fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  title: { color: 'white', fontWeight: '900', fontSize: 26, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.72)', marginTop: 6, lineHeight: 19 },
  mode: { flexDirection: 'row', gap: 8, marginTop: 16, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', alignSelf: 'flex-start' },
  modeAlt: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)', alignSelf: 'flex-start' },
  seg: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  segOn: { backgroundColor: 'rgba(14,165,233,0.22)' },
  segText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800' },
  segTextOn: { color: 'white' },
  label: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', paddingHorizontal: 14, fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#0ea5e9', paddingHorizontal: 16 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 15 },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14 },
  secondaryText: { color: 'white', fontWeight: '800', fontSize: 13 },
  learnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  learn: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' },
  learnText: { color: 'rgba(255,255,255,0.82)', fontWeight: '800', fontSize: 12 },
  helper: { color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 12, lineHeight: 18 },
  summary: { color: 'rgba(255,255,255,0.84)', marginTop: 12, lineHeight: 19 },
  error: { color: '#fca5a5' },
  card: { marginTop: 12, borderRadius: 22, padding: 12 },
  cardTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  cardSub: { color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 18 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  raw: { color: 'rgba(255,255,255,0.82)', lineHeight: 20, fontWeight: '700', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { color: 'rgba(255,255,255,0.56)', fontWeight: '800', flex: 1 },
  rowValue: { color: 'white', fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  map: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(2,6,23,0.55)', marginTop: 10 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 10 },
  statLabel: { color: 'rgba(255,255,255,0.52)', fontSize: 11, fontWeight: '800' },
  statValue: { color: 'white', fontWeight: '900', fontSize: 14, marginTop: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  pillText: { color: 'white', fontWeight: '900', fontSize: 11 },
  high: { backgroundColor: 'rgba(239,68,68,0.24)' },
  elevated: { backgroundColor: 'rgba(245,158,11,0.24)' },
  low: { backgroundColor: 'rgba(34,197,94,0.20)' },
  dim: { opacity: 0.75 },
});
