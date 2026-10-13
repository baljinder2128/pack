import { createElement, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Share, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Button, Card, Empty, ErrorText, Muted, Row, Screen, Title, colors } from '@/components/ui';
import { SignalWarning, STALE_MS } from '@/components/SignalWarning';
import { alert } from '@/lib/alert';
import { formatDateTime, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { mapsLink } from '@/lib/tracking';
import type { LiveDriver } from '@/lib/types';

const REFRESH_MS = 30 * 1000;

// OpenStreetMap via Leaflet: no API key needed. `window.render` is called from
// React Native with the latest positions and the selected driver's track.
const MAP_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}.lbl{background:#1d4ed8;color:#fff;border:0;font-weight:600}</style>
</head><body><div id="map"></div><script>
  // Native: messages go through the WebView bridge. Web: to the parent page.
  window.send = function (m) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m);
    else window.parent.postMessage({ sbtMap: m }, '*');
  };
  var map = L.map('map').setView([-33.87, 151.21], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var fitted = false;
  window.render = function (drivers, track, focus) {
    layer.clearLayers();
    var bounds = [];
    drivers.forEach(function (d) {
      var m = L.circleMarker([d.lat, d.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1 }).addTo(layer);
      m.bindTooltip(d.full_name, { permanent: true, direction: 'top', className: 'lbl', offset: [0, -8] });
      m.on('click', function () { window.send(d.driver_id); });
      bounds.push([d.lat, d.lng]);
    });
    if (track && track.length > 1) L.polyline(track, { color: '#b45309', weight: 4 }).addTo(layer);
    if (focus) map.setView(focus, 13);
    else if (!fitted && bounds.length) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 }); fitted = true; }
  };
  window.send('ready');
</script></body></html>`;

export default function LiveMap() {
  const web = useRef<WebView>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [track, setTrack] = useState<[number, number][]>([]);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  // Everyone on duty, including drivers whose phone hasn't sent a location yet.
  const [onDuty, setOnDuty] = useState<{ id: string; full_name: string; phone: string | null; on_duty_since: string | null }[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ data, error }, duty] = await Promise.all([
        supabase.from('live_drivers').select('*').order('full_name'),
        supabase.from('profiles').select('id, full_name, phone, on_duty_since').eq('on_duty', true).eq('active', true).order('full_name'),
      ]);
      if (!alive) return;
      if (duty.data) setOnDuty(duty.data);
      if (error) setError(error.message);
      else {
        setDrivers((data ?? []) as LiveDriver[]);
        setError(null);
        setUpdated(new Date());
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Track for the selected driver since they went on duty.
  useEffect(() => {
    const d = drivers.find((x) => x.driver_id === selected);
    if (!d) {
      setTrack([]);
      return;
    }
    supabase
      .from('driver_locations')
      .select('lat,lng')
      .eq('driver_id', d.driver_id)
      .gte('recorded_at', d.on_duty_since)
      .order('recorded_at')
      .limit(2000)
      .then(({ data }) => setTrack((data ?? []).map((p) => [p.lat, p.lng])));
  }, [selected, drivers]);

  function onMapMessage(msg: string) {
    if (msg === 'ready') setReady(true);
    else setSelected(msg);
  }

  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === 'web') {
      const win = frame.current?.contentWindow as (Window & { render?: (...a: unknown[]) => void }) | null;
      win?.render?.(drivers, track, focus);
    } else {
      web.current?.injectJavaScript(
        `window.render(${JSON.stringify(drivers)}, ${JSON.stringify(track)}, ${JSON.stringify(focus)}); true;`,
      );
    }
    if (focus) setFocus(null);
  }, [ready, drivers, track, focus]);

  function select(d: LiveDriver) {
    setSelected(d.driver_id);
    setFocus([d.lat, d.lng]);
  }

  async function shareWithCustomer(d: LiveDriver) {
    const message =
      `Delivery update from SBT Truckin: your driver ${d.full_name.split(' ')[0]} was here at ` +
      `${formatTime(d.recorded_at)}: ${mapsLink(d.lat, d.lng)}`;
    try {
      await Share.share({ message });
    } catch {
      // Browsers without a share sheet: copy it so it can be pasted into an email or text.
      await navigator.clipboard?.writeText(message);
      alert('Copied', 'The location message is copied. Paste it into an email or text to your customer.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ height: '50%' }}>
        {Platform.OS === 'web' ? (
          <WebMap frame={frame} onMessage={onMapMessage} />
        ) : (
          <WebView
            ref={web}
            originWhitelist={['*']}
            source={{ html: MAP_HTML }}
            onMessage={(e) => onMapMessage(e.nativeEvent.data)}
          />
        )}
      </View>
      <Screen>
        <Title>
          {onDuty.length} on duty now · {drivers.length} on the map
        </Title>
        {updated && <Muted>Updated {formatTime(updated.toISOString())}, refreshes every 30 seconds</Muted>}
        <ErrorText>{error}</ErrorText>
        <SignalWarning showMapLink={false} />
        {onDuty.length === 0 && <Empty>No drivers are on duty right now.</Empty>}
        {onDuty
          .filter((p) => !drivers.some((d) => d.driver_id === p.id))
          .map((p) => (
            <Card key={p.id}>
              <Row>
                <Title>{p.full_name}</Title>
                <Text style={{ color: colors.warning, marginLeft: 'auto', fontWeight: '600' }}>No location yet</Text>
              </Row>
              <Muted>On duty since {formatDateTime(p.on_duty_since)}. Their phone hasn't sent a location since then.</Muted>
              {p.phone && (
                <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(`tel:${p.phone}`)}>
                  Call {p.phone}
                </Text>
              )}
            </Card>
          ))}
        {drivers.map((d) => {
          const stale = Date.now() - new Date(d.recorded_at).getTime() > STALE_MS;
          return (
            <Card key={d.driver_id} onPress={() => select(d)}>
              <Row>
                <Title>{d.full_name}</Title>
                {selected === d.driver_id && <Text style={{ color: colors.warning, marginLeft: 'auto' }}>Showing route</Text>}
              </Row>
              <Muted>
                Last seen {formatDateTime(d.recorded_at)}
                {d.speed ? ` · ${Math.round(d.speed * 3.6)} km/h` : ''}
              </Muted>
              {stale && <Text style={{ color: colors.warning }}>No update for over 5 minutes (app closed, phone locked, or no signal).</Text>}
              <Row>
                <View style={{ flex: 1 }}>
                  <Button title="Google Maps" variant="secondary" onPress={() => Linking.openURL(mapsLink(d.lat, d.lng))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Send to customer" onPress={() => shareWithCustomer(d)} />
                </View>
              </Row>
              {d.phone && (
                <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(`tel:${d.phone}`)}>
                  Call {d.phone}
                </Text>
              )}
            </Card>
          );
        })}
      </Screen>
    </View>
  );
}

/** Web (Windows browser) version of the map: the same page in an iframe. */
function WebMap({
  frame,
  onMessage,
}: {
  frame: React.RefObject<HTMLIFrameElement | null>;
  onMessage: (msg: string) => void;
}) {
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && typeof e.data?.sbtMap === 'string') onMessage(e.data.sbtMap);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [frame, onMessage]);
  return createElement('iframe', {
    ref: frame,
    srcDoc: MAP_HTML,
    title: 'Live map',
    style: { border: 0, width: '100%', height: '100%' },
  });
}
