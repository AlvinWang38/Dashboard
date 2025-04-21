import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';

const MapZoomHandler = ({ trackerData, selectedDevices, isSingleDeviceZoom }) => {
  const map = useMap();
  const prevBoundsRef = useRef(null); // 用來記錄上一次的 bounds

  useEffect(() => {
    if (isSingleDeviceZoom) return; // 如果是單設備縮放模式，跳過自動縮放

    if (Object.keys(trackerData).length === 0) return;

    const bounds = [];
    Object.entries(trackerData).forEach(([deviceId, path]) => {
      if (selectedDevices.length === 0 || selectedDevices.includes(deviceId)) {
        path.forEach((point) => bounds.push(point.position));
      }
    });

    if (bounds.length > 0) {
      // 將當前 bounds 轉為字符串進行比較
      const boundsString = JSON.stringify(bounds);
      if (prevBoundsRef.current !== boundsString) {
        map.fitBounds(bounds, { padding: [50, 50] });
        prevBoundsRef.current = boundsString; // 更新記錄的 bounds
      }
    }
  }, [map, trackerData, selectedDevices, isSingleDeviceZoom]);

  return null;
};

export default MapZoomHandler;