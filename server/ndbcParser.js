// Lightweight NDBC realtime2 and RSS parsing and normalization

function safeNum(v) {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).replace(/[^0-9+\-\.eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cToF(c) {
  if (c == null) return null;
  return Math.round((c * 9) / 5 + 32);
}
function mToFt(m) {
  if (m == null) return null;
  return Math.round(m * 3.28084 * 10) / 10;
}
function mpsToMph(v) {
  if (v == null) return null;
  return Math.round(v * 2.23694);
}
function ktsToMph(v) {
  if (v == null) return null;
  return Math.round(v * 1.15078);
}

function degToCompass(num) {
  if (num == null) return null;
  const val = Math.floor((num / 22.5) + 0.5);
  const arr = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return arr[(val % 16)];
}

function parseRealtime2(txt) {
  if (!txt) return null;
  const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return null;

  // Find the last header line that starts with '#'
  const headerLines = lines.filter(l => l.trim().startsWith('#'));
  if (!headerLines.length) return null;

  // Choose the header line with many words (column names)
  const headerLine = headerLines[headerLines.length - 1].replace(/^#+\s*/, '').trim();
  const headers = headerLine.split(/\s+/).map(h => h.toUpperCase());

  // Find last data row (not starting with #)
  const dataRows = lines.filter(l => !l.trim().startsWith('#'));
  if (!dataRows.length) return null;
  const lastRow = dataRows[dataRows.length - 1].trim();
  const cols = lastRow.split(/\s+/);

  // Map headers -> values
  const parsed = {};
  for (let i = 0; i < Math.min(headers.length, cols.length); i++) {
    parsed[headers[i]] = cols[i];
  }

  // Attempt to assemble timestamp if YY/MM/DD columns present
  let time = null;
  if (parsed['#YY'] || parsed['YY'] || parsed['YYYY'] || parsed['YR']) {
    // try common sets: YY MM DD hh mm
    const y = parsed['YY'] || parsed['#YY'];
    const mm = parsed['MM'];
    const dd = parsed['DD'];
    const hh = parsed['hh'] || parsed['HH'] || parsed['HOUR'] || parsed['hhmm'] || parsed['HHMM'];
    const min = parsed['mm'] || parsed['MMIN'] || parsed['MIN'] || '00';
    if (y && mm && dd && hh) {
      // YY to 20YY heuristic
      const yyyy = Number(y) < 50 ? '20' + y : '19' + y;
      time = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2,'0')}:${min.padStart(2,'0')}:00Z`).toISOString();
    }
  }

  // Extract useful fields (various column names used by stations)
  const val = (k) => safeNum(parsed[k] || parsed[k && k.toUpperCase()]);
  const ATMP = val('ATMP') || val('ATMP(C)') || val('AIR_TEMPERATURE');
  const WTMP = val('WTMP') || val('WATER_TEMPERATURE') || val('WTEMP');
  const WVHT = val('WVHT') || val('SWELL') || val('WAV') || val('WVHT(M)');
  const WDIR = val('WDIR') || val('WAVE_DIR') || val('WAVDIR');
  const WSPD = val('WSPD') || val('WIND') || val('WIND_SPD');

  const air_c = ATMP;
  const water_c = WTMP;
  const wave_m = WVHT;
  const wind_mps = WSPD; // assume m/s; we'll include kts conversion too

  // Build normalized result
  const out = {
    time,
    air_c: air_c == null ? null : Math.round(air_c * 10) / 10,
    air_f: cToF(air_c),
    water_c: water_c == null ? null : Math.round(water_c * 10) / 10,
    water_f: cToF(water_c),
    wave_m: wave_m == null ? null : Math.round(wave_m * 10) / 10,
    wave_ft: mToFt(wave_m),
    wind_mps: wind_mps == null ? null : Math.round(wind_mps * 10) / 10,
    wind_mph: mpsToMph(wind_mps),
    wind_mph_if_knots: ktsToMph(wind_mps),
    wind_dir_deg: WDIR,
    wind_dir_compass: degToCompass(WDIR)
  };

  return out;
}

function parseNdbcRssFallback(rssText) {
  if (!rssText) return null;
  // Simple regex-based extraction of description text
  const descMatch = rssText.match(/<description>([\s\S]*?)<\/description>/i);
  const desc = descMatch ? descMatch[1] : rssText;
  const txt = desc.replace(/<[^>]+>/g, ' ');

  // attempt to extract numbers followed by units
  const extract = (labelRegex) => {
    const re = new RegExp(labelRegex, 'i');
    const m = txt.match(re);
    if (!m) return null;
    const num = m[1] || m[2];
    return safeNum(num);
  };

  const air_f = extract('(Air Temperature|Air Temp)[^0-9\-\+]*([0-9\-\.]+)\s*°?\s*F') || extract('(Air Temperature|Air Temp)[^0-9\-\+]*([0-9\-\.]+)\s*°?\s*C');
  const water_f = extract('(Water Temperature|Sea Temp|Water Temp)[^0-9\-\+]*([0-9\-\.]+)\s*°?\s*F') || extract('(Water Temperature|Sea Temp|Water Temp)[^0-9\-\+]*([0-9\-\.]+)\s*°?\s*C');
  const wave_ft = extract('(Wave Height|Waves|Swell Height)[^0-9\-\+]*([0-9\-\.]+)\s*(ft|m|meters|feet)');
  const wind_kts = extract('(Wind Speed|Wind)[^0-9\-\+]*([0-9\-\.]+)\s*(kt|kts|kn|knots)') || extract('(Wind Speed|Wind)[^0-9\-\+]*([0-9\-\.]+)\s*(mph)');
  const wind_dir = extract('(Wind Direction|Wind Dir|Dir)[^0-9\-\+]*([0-9\-\.]+)');

  // Normalize
  const out = {
    time: null,
    air_f: air_f == null ? null : Math.round(air_f),
    air_c: air_f == null ? null : Math.round((air_f - 32) * 5 / 9 * 10) / 10,
    water_f: water_f == null ? null : Math.round(water_f),
    water_c: water_f == null ? null : Math.round((water_f - 32) * 5 / 9 * 10) / 10,
    wave_ft: wave_ft == null ? null : Math.round(wave_ft * 10) / 10,
    wave_m: wave_ft == null ? null : Math.round((wave_ft / 3.28084) * 10) / 10,
    wind_kts: wind_kts == null ? null : Math.round(wind_kts),
    wind_mph: wind_kts == null ? null : Math.round(ktsToMph(wind_kts)),
    wind_dir_deg: wind_dir == null ? null : Math.round(wind_dir)
  };
  out.wind_dir_compass = degToCompass(out.wind_dir_deg);
  return out;
}

module.exports = { parseRealtime2, parseNdbcRssFallback };
