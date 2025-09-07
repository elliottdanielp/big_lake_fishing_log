// Standalone NDBC parsers extracted from the cloudflare worker for local testing
'use strict';

function parseOceanText(text){
  if(!text) return null;
  const rawLines = text.split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim() !== '');
  if(rawLines.length < 1) return null;
  let headerLine = null;
  for(let i=0;i<Math.min(10, rawLines.length); i++){
    const t = rawLines[i];
    if(/[#A-Za-z]/.test(t) && /[A-Za-z]/.test(t)) { headerLine = t.replace(/^#\s*/,''); break; }
  }
  const dataLines = rawLines.filter(l => !l.trim().startsWith('#') && /\d/.test(l));
  if(dataLines.length === 0) return null;
  const headers = headerLine ? headerLine.split(/\s+/).map(h=>h.toUpperCase()) : null;
  const sstKeys = ['WTMP','WTMP_C','SST','OTMP','WATERTEMP','WATER_TEMPERATURE'];
  const waveKeys = ['WVHT','HTSGW','SIG_WVHT','SIGNIFICANT_WAVE_HEIGHT','WVHT(M)'];
  const isDateToken = tok => /^(#?YY$|YYYY$|YY$|MM$|DD$|HH$|hh$|mm$|TIME$|DATE$)/i.test(tok);
  let dateCols = 0;
  if(headers){
    for(const h of headers){ if(isDateToken(h)) dateCols++; else break; }
  }
  let sstIdx = -1, waveIdx = -1;
  if(headers){
    for(const k of sstKeys){ const i = headers.indexOf(k); if(i >= 0){ sstIdx = i; break; } }
    for(const k of waveKeys){ const i = headers.indexOf(k); if(i >= 0){ waveIdx = i; break; } }
  }
  if(sstIdx === -1) sstIdx = dateCols;
  if(waveIdx === -1) waveIdx = dateCols;
  let sst = null, wave = null, ts = Date.now();
  for(let i = dataLines.length - 1; i >= 0 && (sst===null || wave===null); i--){
    const parts = dataLines[i].trim().split(/\s+/);
    if(parts.length <= Math.max(sstIdx, waveIdx)) continue;
    const rawSst = parts[sstIdx];
    const rawWave = parts[waveIdx];
    if(sst===null && rawSst && rawSst !== 'MM'){
      const v = parseFloat(rawSst);
      if(!isNaN(v)) sst = v;
    }
    if(wave===null && rawWave && rawWave !== 'MM'){
      const v = parseFloat(rawWave);
      if(!isNaN(v)) wave = v;
    }
    if(parts.length >= 5){
      try{
        let year = parseInt(parts[0]);
        let idx = 0;
        if(year < 100){ year = 2000 + year; idx = 0; }
        const maybeMonth = parseInt(parts[idx+1]);
        const maybeDay = parseInt(parts[idx+2]);
        const maybeHour = parseInt(parts[idx+3]);
        const maybeMin = parseInt(parts[idx+4]);
        if(!isNaN(year) && !isNaN(maybeMonth) && !isNaN(maybeDay) && !isNaN(maybeHour) && !isNaN(maybeMin)){
          ts = Date.UTC(year, maybeMonth-1, maybeDay, maybeHour, maybeMin);
        }
      }catch(e){ }
    }
  }
  const out = {};
  if(sst !== null) out.sstC = Number(sst);
  if(wave !== null) out.waveM = Number(wave);
  out.ts = ts;
  return (out.sstC !== undefined || out.waveM !== undefined) ? out : null;
}

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
  if(sst !== null || wave !== null) {
    const out = {}; if(sst!==null) out.sstC = Number(sst); if(wave!==null) out.waveM = Number(wave); out.ts = ts; return out;
  }
  const rawLines = text.split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim() !== '');
  const dataLines = rawLines.filter(l => !l.trim().startsWith('#') && /\d/.test(l));
  if(dataLines.length === 0) return null;
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

module.exports = { parseOceanText, parseSpecText };
