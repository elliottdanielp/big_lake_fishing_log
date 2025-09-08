// Cloudflare Worker: NDBC -> normalized JSON proxy
// Deploy this as a Worker and call: https://<your-worker>.workers.dev/stations/{station}.json

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request){
  try{
    const url = new URL(request.url);
    // Expect path like /stations/45161.json or /stations/45161
    const parts = url.pathname.split('/').filter(Boolean);
    const station = parts.length ? (parts[parts.length-1].replace(/\.json$/,'') ) : null;
    if(!station) return new Response(JSON.stringify({ error:'station missing in path'}), { status:400, headers: corsHeaders() });
  const debugMode = url.searchParams.get('debug');
  const rawMode = url.searchParams.get('raw');
  const prefer = url.searchParams.get('prefer'); // e.g. 'ocean-spec'

    // Try .ocean first
    const oceanUrl = `https://www.ndbc.noaa.gov/data/realtime2/${station}.ocean`;
    let lastFetched = { ocean: null, spec: null };
    try{
      const r = await fetch(oceanUrl, { cf: { cacheTtl: 60 }, headers: { 'User-Agent': 'NDBC-proxy/1.0' } });
      if(r.ok){
        const txt = await r.text();
        lastFetched.ocean = txt;
        if(rawMode) return jsonResponse({ station, raw: lastFetched });
        const parsed = parseOceanText(txt);
        // honor prefer=ocean-spec by not returning yet unless we also parse spec later
        if(parsed && !prefer) return jsonResponse(Object.assign({ station }, parsed));
      }
    }catch(e){ /* ignore and fallthrough */ console.warn('ocean fetch failed', e); }

    // Try .spec as fallback
    const specUrl = `https://www.ndbc.noaa.gov/data/realtime2/${station}.spec`;
    try{
      const r2 = await fetch(specUrl, { cf: { cacheTtl: 60 }, headers: { 'User-Agent': 'NDBC-proxy/1.0' } });
      if(r2.ok){
        const txt2 = await r2.text();
        lastFetched.spec = txt2;
        if(rawMode) return jsonResponse({ station, raw: lastFetched });
        const parsed2 = parseSpecText(txt2);
        if(parsed2 && !prefer) return jsonResponse(Object.assign({ station }, parsed2));
      }
    }catch(e){ console.warn('spec fetch failed', e); }

    // If prefer=ocean-spec, try to parse both and compose a response
    if(prefer === 'ocean-spec'){
      let composed = { station };
      try{ if(lastFetched.ocean){ const p = parseOceanText(lastFetched.ocean); if(p && p.sstC !== undefined) composed.sstC = p.sstC; } }catch(e){}
      try{ if(lastFetched.spec){ const p2 = parseSpecText(lastFetched.spec); if(p2 && p2.waveM !== undefined) composed.waveM = p2.waveM; } }catch(e){}
      if(composed.sstC !== undefined || composed.waveM !== undefined) return jsonResponse(composed);
    }

    // If debug requested, return the raw upstream content to help tuning
    if(debugMode){
      return new Response(JSON.stringify({ error: 'no usable data found for station', raw: lastFetched }), { status:502, headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ error: 'no usable data found for station' }), { status:502, headers: corsHeaders() });
  }catch(err){
    return new Response(JSON.stringify({ error: err.message }), { status:500, headers: corsHeaders() });
  }
}

function jsonResponse(obj){ return new Response(JSON.stringify(obj), { status:200, headers: Object.assign({ 'Content-Type':'application/json' }, corsHeaders()) }); }
function corsHeaders(){ return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' }; }

// Heuristic parser for .ocean files (column headers + rows). Returns { sstC, waveM, ts }
function parseOceanText(text){
  if(!text) return null;
  // keep header lines that begin with '#', but normalize them
  const rawLines = text.split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim() !== '');
  if(rawLines.length < 1) return null;

  // Find a header line (may start with '#') within the first 10 lines
  let headerLine = null;
  for(let i=0;i<Math.min(10, rawLines.length); i++){
    const t = rawLines[i];
    // header often starts with '#' and contains alphabetic tokens
    if(/[#A-Za-z]/.test(t) && /[A-Za-z]/.test(t)) { headerLine = t.replace(/^#\s*/,''); break; }
  }

  // Collect candidate data lines (non-header rows)
  const dataLines = rawLines.filter(l => !l.trim().startsWith('#') && /\d/.test(l));
  if(dataLines.length === 0) return null;

  // Parse headers and attempt to map columns
  const headers = headerLine ? headerLine.split(/\s+/).map(h=>h.toUpperCase()) : null;

  // helper keys
  const sstKeys = ['WTMP','WTMP_C','SST','OTMP','WATERTEMP','WATER_TEMPERATURE'];
  const waveKeys = ['WVHT','HTSGW','SIG_WVHT','SIGNIFICANT_WAVE_HEIGHT','WVHT(M)'];

  // find index of date/time columns (count how many leading tokens look like year/month/day/hour/min)
  const isDateToken = tok => /^(#?YY$|YYYY$|YY$|MM$|DD$|HH$|hh$|mm$|TIME$|DATE$)/i.test(tok);
  let dateCols = 0;
  if(headers){
    for(const h of headers){ if(isDateToken(h)) dateCols++; else break; }
  }

  // Determine indices for sst and wave
  let sstIdx = -1, waveIdx = -1;
  if(headers){
    for(const k of sstKeys){ const i = headers.indexOf(k); if(i >= 0){ sstIdx = i; break; } }
    for(const k of waveKeys){ const i = headers.indexOf(k); if(i >= 0){ waveIdx = i; break; } }
  }

  // Fallback: if we didn't find indices, assume first numeric column after dateCols
  if(sstIdx === -1) sstIdx = dateCols; // may be wrong but better than nothing
  if(waveIdx === -1) waveIdx = dateCols; // spec/ocean may differ, we'll scan values

  // Scan recent data lines (from newest to older) looking for non-MM numeric values
  // Heuristics: SST usually between -5 and 30 °C; wave height usually 0..20 m.
  let sst = null, wave = null, ts = Date.now();
  for (let i = dataLines.length - 1; i >= 0 && (sst === null || wave === null); i--) {
    const parts = dataLines[i].trim().split(/\s+/);
    if (!parts.length) continue;

    // Try header-index-based picks first (if indices are in range)
    if (sst === null && sstIdx >= 0 && sstIdx < parts.length) {
      const rawSst = parts[sstIdx];
      if (rawSst && rawSst !== 'MM') {
        const v = parseFloat(rawSst);
        if (!isNaN(v)) sst = v;
      }
    }
    if (wave === null && waveIdx >= 0 && waveIdx < parts.length) {
      const rawWave = parts[waveIdx];
      if (rawWave && rawWave !== 'MM') {
        const v = parseFloat(rawWave);
        if (!isNaN(v)) wave = v;
      }
    }

    // If indices were ambiguous (often equal) or values missing, scan numeric columns
    if (sst === null || wave === null) {
      for (let c = Math.max(0, dateCols); c < parts.length && (sst === null || wave === null); c++) {
        const tok = parts[c];
        if (!tok || tok === 'MM') continue;
        const v = parseFloat(tok);
        if (isNaN(v)) continue;
        // candidate for SST
        if (sst === null && v > -10 && v < 40) {
          // likely SST/C or water temp; accept
          sst = v;
          continue;
        }
        // candidate for wave (meters)
        if (wave === null && v >= 0 && v < 50) {
          // plausible wave height in meters (allow up to 50 to be permissive)
          wave = v;
          continue;
        }
      }
    }

    // Attempt to parse timestamp from this row if possible
    if (parts.length >= 5) {
      try {
        let year = parseInt(parts[0]);
        let idx = 0;
        if (year < 100) year = 2000 + year;
        const maybeMonth = parseInt(parts[idx + 1]);
        const maybeDay = parseInt(parts[idx + 2]);
        const maybeHour = parseInt(parts[idx + 3]);
        const maybeMin = parseInt(parts[idx + 4]);
        if (!isNaN(year) && !isNaN(maybeMonth) && !isNaN(maybeDay) && !isNaN(maybeHour) && !isNaN(maybeMin)) {
          ts = Date.UTC(year, maybeMonth - 1, maybeDay, maybeHour, maybeMin);
        }
      } catch (e) { /* ignore */ }
    }
  }

  const out = {};
  if(sst !== null) out.sstC = Number(sst);
  if(wave !== null) out.waveM = Number(wave);
  out.ts = ts;
  return (out.sstC !== undefined || out.waveM !== undefined) ? out : null;
}

// Simple .spec parser that looks for lines like "water_temperature: 6.2 C" or "wave_height: 0.45 m"
function parseSpecText(text){
  if(!text) return null;
  // First try key: value lines
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  let sst = null, wave = null, ts = Date.now();
  for(const ln of lines){
    const m1 = ln.match(/water[_\s]?temperature[:\s]+([0-9.+-]+)\s*([CFcm])?/i);
    if(m1){ const val = parseFloat(m1[1]); const unit = (m1[2]||'').toUpperCase(); if(!isNaN(val)){ if(unit==='F') sst = (val-32)*5/9; else sst = val; } }
    const m2 = ln.match(/wave[_\s]?height[:\s]+([0-9.+-]+)\s*(m|ft)?/i);
    if(m2){ const val = parseFloat(m2[1]); const unit = (m2[2]||'').toLowerCase(); if(!isNaN(val)){ wave = (unit==='ft') ? val * 0.3048 : val; } }
    const m3 = ln.match(/date[:\s]+(\d{4}-\d{2}-\d{2})/i);
    if(m3){ const d = new Date(m3[1]); if(!isNaN(d)) ts = d.getTime(); }
  }
  // If we found both, return
  if(sst !== null || wave !== null) {
    const out = {}; if(sst!==null) out.sstC = Number(sst); if(wave!==null) out.waveM = Number(wave); out.ts = ts; return out;
  }

  // Otherwise try tabular/spec style (similar to .ocean) — find header and data rows
  const rawLines = text.split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim() !== '');
  const dataLines = rawLines.filter(l => !l.trim().startsWith('#') && /\d/.test(l));
  if(dataLines.length === 0) return null;
  // Try to find header
  let headerLine = null;
  for(let i=0;i<Math.min(10, rawLines.length); i++){
    const t = rawLines[i];
    if(/[#A-Za-z]/.test(t) && /[A-Za-z]/.test(t)) { headerLine = t.replace(/^#\s*/,''); break; }
  }
  const headers = headerLine ? headerLine.split(/\s+/).map(h=>h.toUpperCase()) : null;
  const waveKeys = ['WVHT','HTSGW','SIG_WVHT','SIGNIFICANT_WAVE_HEIGHT','WVHT(M)'];
  let waveIdx = -1;
  if(headers){ for(const k of waveKeys){ const i = headers.indexOf(k); if(i>=0){ waveIdx = i; break; } } }
  const dateCols = headers ? headers.reduce((n,h)=> n + (/^(#?YY$|YYYY$|YY$|MM$|DD$|HH$|hh$|mm$)/i.test(h) ? 1 : 0), 0) : 0;
  if(waveIdx === -1) waveIdx = dateCols;
  for(let i = dataLines.length - 1; i >=0; i--){
    const parts = dataLines[i].trim().split(/\s+/);
    if(parts.length <= waveIdx) continue;
    const rawWave = parts[waveIdx];
    if(rawWave && rawWave !== 'MM'){
      const v = parseFloat(rawWave); if(!isNaN(v)) { wave = v; }
    }
    if(parts.length >= 5 && !isNaN(parseInt(parts[0]))){
      try{
        let year = parseInt(parts[0]); if(year < 100) year = 2000 + year;
        const month = parseInt(parts[1]); const day = parseInt(parts[2]); const hour = parseInt(parts[3]); const minute = parseInt(parts[4]);
        if(!isNaN(year) && !isNaN(month) && !isNaN(day)) ts = Date.UTC(year, month-1, day, hour||0, minute||0);
      }catch(e){}
    }
    if(wave !== null) break;
  }
  const out = {}; if(sst!==null) out.sstC = Number(sst); if(wave!==null) out.waveM = Number(wave); out.ts = ts; return (out.sstC!==undefined || out.waveM!==undefined) ? out : null;
}
