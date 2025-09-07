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

    // Try .ocean first
    const oceanUrl = `https://www.ndbc.noaa.gov/data/realtime2/${station}.ocean`;
    try{
      const r = await fetch(oceanUrl, { cf: { cacheTtl: 60 }, headers: { 'User-Agent': 'NDBC-proxy/1.0' } });
      if(r.ok){
        const txt = await r.text();
        const parsed = parseOceanText(txt);
        if(parsed) return jsonResponse(Object.assign({ station }, parsed));
      }
    }catch(e){ /* ignore and fallthrough */ console.warn('ocean fetch failed', e); }

    // Try .spec as fallback
    const specUrl = `https://www.ndbc.noaa.gov/data/realtime2/${station}.spec`;
    try{
      const r2 = await fetch(specUrl, { cf: { cacheTtl: 60 }, headers: { 'User-Agent': 'NDBC-proxy/1.0' } });
      if(r2.ok){
        const txt2 = await r2.text();
        const parsed2 = parseSpecText(txt2);
        if(parsed2) return jsonResponse(Object.assign({ station }, parsed2));
      }
    }catch(e){ console.warn('spec fetch failed', e); }

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
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean).filter(l=>!l.startsWith('#'));
  if(lines.length < 2) return null;
  // Find header line (non-numeric tokens) and last data line
  let headerLine = null; let dataLine = null;
  for(let i=0;i<Math.min(5, lines.length); i++){
    const t = lines[i];
    if(/[A-Za-z]/.test(t)) { headerLine = t; break; }
  }
  // assume the last line is the most recent data
  dataLine = lines[lines.length-1];
  if(!headerLine) {
    // fallback: maybe file only has data rows with leading date/time columns; try splitting last line and map by position with common names
    const vals = dataLine.split(/\s+/);
    // not much we can do here
    return null;
  }
  const headers = headerLine.split(/\s+/).map(h=>h.toUpperCase());
  const values = dataLine.split(/\s+/);
  const map = {};
  for(let i=0;i<Math.min(headers.length, values.length); i++) map[headers[i]] = values[i];

  // Common column names to look for
  const sstKeys = ['WTMP','WTMP_C','SST','WATERTEMP','WATER_TEMPERATURE'];
  const waveKeys = ['WVHT','HTSGW','SIG_WVHT','SIGNIFICANT_WAVE_HEIGHT','WVHT(M)'];
  let sst = null, wave = null;
  for(const k of sstKeys){ if(map[k] !== undefined && map[k] !== 'MM'){ const v = parseFloat(map[k]); if(!isNaN(v)){ sst = v; break; } } }
  for(const k of waveKeys){ if(map[k] !== undefined && map[k] !== 'MM'){ const v = parseFloat(map[k]); if(!isNaN(v)){ wave = v; break; } } }

  // Timestamp: try to find TIME/DATE or YEAR/MONTH/DAY/HOUR
  let ts = Date.now();
  const dateKeys = ['#YY','YYYY','YY','MM','DD','hh','mm','TIME','DATE'];
  // Try to parse common year/month/day cols if present
  try{
    if(map['#YY'] && map['MM'] && map['DD'] && map['hh'] && map['mm']){
      const year = 2000 + parseInt(map['#YY']); const month = parseInt(map['MM'])-1; const day = parseInt(map['DD']); const hour = parseInt(map['hh']); const min = parseInt(map['mm']); ts = Date.UTC(year, month, day, hour, min);
    }else if(map['DATE'] && map['TIME']){
      const dstr = map['DATE'] + ' ' + map['TIME']; const d = new Date(dstr); if(!isNaN(d)) ts = d.getTime();
    }
  }catch(e){ /* ignore */ }

  // Units: assume sst parsed is in degrees Celsius in many NDBC outputs; wave often meters
  const out = {};
  if(sst !== null) out.sstC = Number(sst);
  if(wave !== null) out.waveM = Number(wave);
  out.ts = ts;
  return (out.sstC !== undefined || out.waveM !== undefined) ? out : null;
}

// Simple .spec parser that looks for lines like "water_temperature: 6.2 C" or "wave_height: 0.45 m"
function parseSpecText(text){
  if(!text) return null;
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
  const out = {}; if(sst!==null) out.sstC = Number(sst); if(wave!==null) out.waveM = Number(wave); out.ts = ts; return (out.sstC!==undefined || out.waveM!==undefined) ? out : null;
}
