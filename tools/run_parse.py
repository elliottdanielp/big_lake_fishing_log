#!/usr/bin/env python3
import re, json, datetime, sys


def parse_ocean_text(text):
    if not text:
        return None
    raw_lines = [l.replace('\r','') for l in text.split('\n') if l.strip() != '']
    header_line = None
    for t in raw_lines[:10]:
        if re.search('[A-Za-z]', t):
            header_line = re.sub(r'^#\s*', '', t)
            break
    data_lines = [l for l in raw_lines if not l.strip().startswith('#') and re.search(r'\d', l)]
    if not data_lines:
        return None
    headers = header_line.split() if header_line else None
    headers = [h.upper() for h in headers] if headers else None
    sst_keys = ['WTMP', 'WTMP_C', 'SST', 'OTMP', 'WATERTEMP', 'WATER_TEMPERATURE']
    wave_keys = ['WVHT', 'HTSGW', 'SIG_WVHT', 'SIGNIFICANT_WAVE_HEIGHT', 'WVHT(M)']

    def is_date_token(tok):
        return re.match(r'^(#?YY$|YYYY$|YY$|MM$|DD$|HH$|hh$|mm$|TIME$|DATE$)', tok, re.I) is not None

    date_cols = 0
    if headers:
        for h in headers:
            if is_date_token(h):
                date_cols += 1
            else:
                break

    sst_idx = -1
    wave_idx = -1
    if headers:
        for k in sst_keys:
            if k in headers:
                sst_idx = headers.index(k)
                break
        for k in wave_keys:
            if k in headers:
                wave_idx = headers.index(k)
                break
    if sst_idx == -1:
        sst_idx = date_cols
    if wave_idx == -1:
        wave_idx = date_cols

    sst = None
    wave = None
    ts = int(datetime.datetime.utcnow().timestamp() * 1000)

    # scan newest -> older
    for line in reversed(data_lines):
        parts = line.strip().split()
        if len(parts) <= max(sst_idx, wave_idx):
            continue
        raw_sst = parts[sst_idx]
        raw_wave = parts[wave_idx]
        if sst is None and raw_sst and raw_sst != 'MM':
            try:
                v = float(raw_sst)
                sst = v
            except:
                pass
        if wave is None and raw_wave and raw_wave != 'MM':
            try:
                v = float(raw_wave)
                wave = v
            except:
                pass
        # parse timestamp if possible: YY MM DD hh mm  OR YYYY MM DD hh mm
        if len(parts) >= 5:
            try:
                year = int(parts[0])
                if year < 100:
                    year = 2000 + year
                month = int(parts[1])
                day = int(parts[2])
                hour = int(parts[3])
                minute = int(parts[4])
                dt = datetime.datetime(year, month, day, hour, minute, tzinfo=datetime.timezone.utc)
                ts = int(dt.timestamp() * 1000)
            except Exception:
                pass
        if sst is not None and wave is not None:
            break

    out = {}
    if sst is not None:
        out['sstC'] = sst
    if wave is not None:
        out['waveM'] = wave
    out['ts'] = ts
    return out if ('sstC' in out or 'waveM' in out) else None


def parse_spec_text(text):
    if not text:
        return None
    lines = [l.strip() for l in text.split('\n') if l.strip() != '']
    sst = None
    wave = None
    ts = int(datetime.datetime.utcnow().timestamp() * 1000)
    # key: value style first
    for ln in lines:
        m1 = re.search(r'water[_\s]?temperature[:\s]+([0-9.+-]+)\s*([CFcm])?', ln, re.I)
        if m1:
            val = float(m1.group(1))
            unit = (m1.group(2) or '').upper()
            sst = (val - 32) * 5.0 / 9.0 if unit == 'F' else val
        m2 = re.search(r'wave[_\s]?height[:\s]+([0-9.+-]+)\s*(m|ft)?', ln, re.I)
        if m2:
            val = float(m2.group(1))
            unit = (m2.group(2) or '').lower()
            wave = val * 0.3048 if unit == 'ft' else val
        m3 = re.search(r'date[:\s]+(\d{4}-\d{2}-\d{2})', ln, re.I)
        if m3:
            try:
                d = datetime.date.fromisoformat(m3.group(1))
                ts = int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp() * 1000)
            except:
                pass
    if sst is not None or wave is not None:
        out = {}
        if sst is not None:
            out['sstC'] = sst
        if wave is not None:
            out['waveM'] = wave
        out['ts'] = ts
        return out

    # Tabular fallback
    raw_lines = [l.replace('\r','') for l in text.split('\n') if l.strip() != '']
    data_lines = [l for l in raw_lines if not l.strip().startswith('#') and re.search(r'\d', l)]
    if not data_lines:
        return None
    header_line = None
    for t in raw_lines[:10]:
        if re.search('[A-Za-z]', t):
            header_line = re.sub(r'^#\s*', '', t)
            break
    headers = header_line.split() if header_line else None
    headers = [h.upper() for h in headers] if headers else None
    wave_keys = ['WVHT', 'HTSGW', 'SIG_WVHT', 'SIGNIFICANT_WAVE_HEIGHT', 'WVHT(M)']
    wave_idx = -1
    if headers:
        for k in wave_keys:
            if k in headers:
                wave_idx = headers.index(k)
                break
    date_cols = 0
    if headers:
        for h in headers:
            if re.match(r'^(#?YY$|YYYY$|YY$|MM$|DD$|HH$|hh$|mm$)', h, re.I):
                date_cols += 1
            else:
                break
    if wave_idx == -1:
        wave_idx = date_cols

    for line in reversed(data_lines):
        parts = line.strip().split()
        if len(parts) <= wave_idx:
            continue
        raw_wave = parts[wave_idx]
        if raw_wave and raw_wave != 'MM':
            try:
                v = float(raw_wave)
                wave = v
            except:
                pass
        if len(parts) >= 5:
            try:
                year = int(parts[0])
                if year < 100:
                    year = 2000 + year
                month = int(parts[1]); day = int(parts[2]); hour = int(parts[3]); minute = int(parts[4])
                dt = datetime.datetime(year, month, day, hour, minute, tzinfo=datetime.timezone.utc)
                ts = int(dt.timestamp() * 1000)
            except:
                pass
        if wave is not None:
            break

    out = {}
    if sst is not None:
        out['sstC'] = sst
    if wave is not None:
        out['waveM'] = wave
    out['ts'] = ts
    return out if ('sstC' in out or 'waveM' in out) else None


def read_file(path):
    try:
        with open(path, 'r', encoding='utf8') as f:
            return f.read()
    except Exception as e:
        print('ERROR reading', path, e, file=sys.stderr)
        return None

if __name__ == '__main__':
    ocean = read_file('ndbc-45161.ocean.txt')
    spec = read_file('ndbc-45161.spec.txt')
    print('--- OCEAN ---')
    print(json.dumps(parse_ocean_text(ocean), indent=2))
    print('--- SPEC ---')
    print(json.dumps(parse_spec_text(spec), indent=2))
