import { createElement, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

// OpenStreetMap via Leaflet: no API key needed. `window.render` is called from
// React Native with the latest positions and the selected driver's track.
export const MAP_HTML = `<!doctype html><html><head>
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
  window.render = function (drivers, track, focus, fitTrack) {
    layer.clearLayers();
    var bounds = [];
    drivers.forEach(function (d) {
      var m = L.circleMarker([d.lat, d.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1 }).addTo(layer);
      m.bindTooltip(d.full_name, { permanent: true, direction: 'top', className: 'lbl', offset: [0, -8] });
      m.on('click', function () { window.send(d.driver_id); });
      bounds.push([d.lat, d.lng]);
    });
    if (track && track.length > 1) L.polyline(track, { color: '#b45309', weight: 4 }).addTo(layer);
    if (fitTrack && track && track.length) map.fitBounds(track, { padding: [30, 30], maxZoom: 15 });
    else if (focus) map.setView(focus, 13);
    else if (!fitted && bounds.length) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 }); fitted = true; }
  };
  window.send('ready');
</script></body></html>`;

/** A route on the map, zoomed to fit (used by route history). */
export function RouteMap({ track }: { track: [number, number][] }) {
  const web = useRef<WebView>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.sbtMap === 'ready') setReady(true);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const ends = track.length
      ? [
          { driver_id: 'start', full_name: 'Start', lat: track[0][0], lng: track[0][1] },
          { driver_id: 'end', full_name: 'End', lat: track[track.length - 1][0], lng: track[track.length - 1][1] },
        ]
      : [];
    if (Platform.OS === 'web') {
      const win = frame.current?.contentWindow as (Window & { render?: (...a: unknown[]) => void }) | null;
      win?.render?.(ends, track, null, true);
    } else {
      web.current?.injectJavaScript(`window.render(${JSON.stringify(ends)}, ${JSON.stringify(track)}, null, true); true;`);
    }
  }, [ready, track]);

  if (Platform.OS === 'web') {
    return createElement('iframe', {
      ref: frame,
      srcDoc: MAP_HTML,
      title: 'Route map',
      style: { border: 0, width: '100%', height: '100%' },
    });
  }
  return (
    <WebView
      ref={web}
      originWhitelist={['*']}
      source={{ html: MAP_HTML }}
      onMessage={(e) => e.nativeEvent.data === 'ready' && setReady(true)}
    />
  );
}
