import axios from 'axios';
import { format } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, LayersControl, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import TimeRangePicker from '../TimeRangePicker';
import MapZoomHandler from './MapZoomHandler';

const colorMap = {
  '#ff0000': 'red',
  '#00ff00': 'green',
  '#0000ff': 'blue',
  '#ee82ee': 'violet',
  '#ffa500': 'orange',
  '#800080': 'purple',
  '#ffff00': 'yellow',
  '#000000': 'black',
  '#ffd700': 'gold',
};

// 使用環境變數設置後端基礎 URL
const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// 檢查點是否在多邊形內（ray-casting 演算法）
const isPointInPolygon = (point, polygon) => {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const createCustomIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
};

const Dashboard = () => {
  const [trackerData, setTrackerData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [groups, setGroups] = useState(['default']);
  const [selectedGroup, setSelectedGroup] = useState('All Groups');
  const [geofences, setGeofences] = useState([]);
  const [devicesInGeofence, setDevicesInGeofence] = useState({});

  const fetchTrackerData = useCallback(async (timeRange) => {
    try {
      let url = `${BASE_URL}/messages`;
      if (timeRange.type === 'relative') {
        url += `?range=${timeRange.value}`;
      } else if (timeRange.type === 'custom') {
        url += `?from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;
      }

      const res = await axios.get(url);
      const data = res.data.data;

      const allUniqueDeviceIds = [...new Set(data.map((msg) => msg.device_id))];
      const validData = data.filter((msg) => msg.b !== 255 && msg.lg !== 255);

      const groupedData = validData.reduce((acc, msg) => {
        const deviceId = msg.device_id;
        if (!acc[deviceId]) {
          acc[deviceId] = [];
        }
        acc[deviceId].push({
          position: [msg.la, msg.lg],
          time: msg.time,
          tmp: msg.tmp,
          tiltx: msg.tiltx,
          tilty: msg.tilty,
          tiltz: msg.tiltz,
          corev: msg.corev,
          liionv: msg.liionv,
        });
        return acc;
      }, {});

      Object.keys(groupedData).forEach((deviceId) => {
        groupedData[deviceId].sort((a, b) => new Date(a.time) - new Date(b.time));
      });

      const devicesWithSettings = await Promise.all(
        allUniqueDeviceIds.map(async (deviceId) => {
          try {
            const response = await axios.get(`${BASE_URL}/devices/${deviceId}/settings`);
            const settings = response.data;
            return {
              deviceId,
              group: settings.group_name || 'default',
              labelColor: settings.label_color || '#000000',
              geofenceId: settings.geofence_id || null,
            };
          } catch (error) {
            console.error(`Error fetching settings for device ${deviceId}:`, error);
            return {
              deviceId,
              group: 'default',
              labelColor: '#000000',
              geofenceId: null,
            };
          }
        })
      );

      const deviceSettingsMap = devicesWithSettings.reduce((acc, device) => {
        acc[device.deviceId] = {
          group: device.group,
          labelColor: device.labelColor,
          colorName: colorMap[device.labelColor] || 'black',
          geofenceId: device.geofenceId,
        };
        return acc;
      }, {});

      const filteredDeviceIds = selectedGroup === 'All Groups'
        ? allUniqueDeviceIds
        : allUniqueDeviceIds.filter((deviceId) => deviceSettingsMap[deviceId].group === selectedGroup);

      const filteredGroupedData = Object.fromEntries(
        Object.entries(groupedData).filter(([deviceId]) => filteredDeviceIds.includes(deviceId))
      );

      const filteredTrackerData = selectedDevices.length > 0
        ? Object.fromEntries(
            Object.entries(filteredGroupedData).filter(([deviceId]) => selectedDevices.includes(deviceId))
          )
        : filteredGroupedData;
      setTrackerData(filteredTrackerData);

      const fullData = data.reduce((acc, msg) => {
        const deviceId = msg.device_id;
        if (!acc[deviceId]) {
          acc[deviceId] = [];
        }
        acc[deviceId].push({
          position: [msg.la, msg.lg],
          time: msg.time,
          tmp: msg.tmp,
        });
        return acc;
      }, {});

      Object.keys(fullData).forEach((deviceId) => {
        fullData[deviceId].sort((a, b) => new Date(a.time) - new Date(b.time));
      });

      const tableEntries = filteredDeviceIds.map((deviceId) => {
        const path = fullData[deviceId];
        const lastPoint = path[path.length - 1];
        const allInvalid = path.every((p) => p.position[0] === 255 && p.position[1] === 255);
        return {
          deviceId,
          color: deviceSettingsMap[deviceId].colorName,
          labelColor: deviceSettingsMap[deviceId].labelColor,
          group: deviceSettingsMap[deviceId].group,
          geofenceId: deviceSettingsMap[deviceId].geofenceId,
          lastTime: lastPoint.time,
          lat: lastPoint.position[0],
          lon: lastPoint.position[1],
          temp: lastPoint.tmp,
          allInvalid,
        };
      });

      // 檢查設備是否在 Geofence 內
      const inGeofenceMap = {};
      tableEntries.forEach((entry) => {
        if (entry.geofenceId && !entry.allInvalid) {
          const geofence = geofences.find((g) => g.id === entry.geofenceId);
          if (geofence) {
            const isInside = isPointInPolygon([entry.lat, entry.lon], geofence.coordinates);
            inGeofenceMap[entry.deviceId] = isInside;
          }
        }
      });
      setDevicesInGeofence(inGeofenceMap);

      tableEntries.sort((a, b) => {
        if (a.allInvalid && !b.allInvalid) return 1;
        if (!a.allInvalid && b.allInvalid) return -1;
        return new Date(b.lastTime) - new Date(a.lastTime);
      });

      setTableData(tableEntries);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch tracker data:', error);
      setLoading(false);
    }
  }, [selectedDevices, selectedGroup, geofences]);

  const handleTimeRangeChange = (timeRange) => {
    setLoading(true);
    fetchTrackerData(timeRange);
  };

  useEffect(() => {
    const fetchGroupsAndGeofences = async () => {
      try {
        const groupsRes = await axios.get(`${BASE_URL}/groups`);
        setGroups(groupsRes.data);

        const geofencesRes = await axios.get(`${BASE_URL}/geofences`);
        setGeofences(geofencesRes.data);
      } catch (error) {
        console.error('Failed to fetch groups or geofences:', error);
      }
    };

    fetchGroupsAndGeofences();
    fetchTrackerData({ type: 'relative', value: '1h' });

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchTrackerData({ type: 'relative', value: '1h' });
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchTrackerData, refreshInterval]);

  const handleDeviceToggle = (deviceId) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleRefreshChange = (e) => {
    setRefreshInterval(parseInt(e.target.value, 10));
  };

  const handleGroupChange = (e) => {
    setSelectedGroup(e.target.value);
    setSelectedDevices([]);
  };

  const containerStyle = {
    marginLeft: '220px',
    padding: '20px',
    display: 'flex',
    height: 'calc(100vh - 40px)',
  };

  const leftPanelStyle = {
    width: '50%',
    height: '100%',
    paddingRight: '10px',
  };

  const rightPanelStyle = {
    width: '50%',
    height: '100%',
    paddingLeft: '10px',
    overflowY: 'auto',
    marginTop: '70px',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  };

  const mapStyle = {
    width: '100%',
    height: 'calc(100% - 70px)',
  };

  const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
    marginTop: '0',
  };

  const thTdStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: 'left',
    fontSize: '14px',
  };

  const thStyle = {
    ...thTdStyle,
    backgroundColor: '#f2f2f2',
    fontWeight: 'bold',
  };

  const titleStyle = {
    fontSize: '24px',
    marginBottom: '10px',
  };

  const filterStyle = {
    marginBottom: '10px',
    fontSize: '14px',
  };

  const deviceIdStyle = (deviceId) => ({
    color: devicesInGeofence[deviceId] ? '#ff0000' : '#007bff',
    textDecoration: 'underline',
  });

  const defaultCenter = [25.0330, 121.5654];

  const { BaseLayer } = LayersControl;

  return (
    <div style={containerStyle}>
      <div style={leftPanelStyle}>
        <h1 style={titleStyle}>Dashboard</h1>
        <div style={headerStyle}>
          <label>
            Refresh Interval:
            <select value={refreshInterval} onChange={handleRefreshChange} style={{ marginLeft: '5px', fontSize: '14px' }}>
              <option value={0}>Not Refresh</option>
              <option value={30000}>30 seconds</option>
              <option value={60000}>1 minute</option>
              <option value={300000}>5 minutes</option>
            </select>
          </label>
          <TimeRangePicker onTimeRangeChange={handleTimeRangeChange} />
        </div>
        {loading ? (
          <p>Loading map...</p>
        ) : (
          <MapContainer center={defaultCenter} zoom={10} style={mapStyle}>
            <LayersControl position="topright">
              <BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
              </BaseLayer>
              <BaseLayer name="Satellite">
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution="Tiles © Esri"
                  maxZoom={19}
                />
              </BaseLayer>
            </LayersControl>
            <MapZoomHandler trackerData={trackerData} selectedDevices={selectedDevices} />
            {Object.entries(trackerData).map(([deviceId, path]) => {
              const lastPoint = path[path.length - 1];
              const color = tableData.find((entry) => entry.deviceId === deviceId)?.color || 'red';
              return (
                <div key={deviceId}>
                  <Polyline
                    positions={path.map((p) => p.position)}
                    color={color}
                    weight={3}
                  />
                  <Marker position={lastPoint.position} icon={createCustomIcon(color)}>
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                      Device ID: {deviceId}<br />
                      Lat: {lastPoint.position[0]}<br />
                      Lon: {lastPoint.position[1]}
                    </Tooltip>
                    <Popup>
                      <b>Device ID:</b> {deviceId}<br />
                      <b>Time:</b> {format(new Date(lastPoint.time), 'yyyy/MM/dd HH:mm:ss')}<br />
                      <b>Latitude:</b> {lastPoint.position[0]}<br />
                      <b>Longitude:</b> {lastPoint.position[1]}<br />
                      <b>Temperature:</b> {lastPoint.tmp}°C<br />
                      <b>Tilt X:</b> {lastPoint.tiltx}<br />
                      <b>Tilt Y:</b> {lastPoint.tilty}<br />
                      <b>Tilt Z:</b> {lastPoint.tiltz}<br />
                      <b>Core Voltage:</b> {lastPoint.corev}V<br />
                      <b>Li-ion Voltage:</b> {lastPoint.liionv}V
                    </Popup>
                  </Marker>
                </div>
              );
            })}
            {geofences.map((geofence) => (
              <Polygon
                key={geofence.id}
                positions={geofence.coordinates}
                color={geofence.color}
                weight={2}
                opacity={0.5}
                fillOpacity={0.2}
              >
                <Tooltip direction="center" opacity={0.9}>
                  {geofence.name || 'Unnamed Geofence'}
                </Tooltip>
              </Polygon>
            ))}
          </MapContainer>
        )}
      </div>
      <div style={rightPanelStyle}>
        <div style={filterStyle}>
          <label>
            Filter by Group:
            <select
              value={selectedGroup}
              onChange={handleGroupChange}
              style={{ marginLeft: '5px', fontSize: '14px' }}
            >
              <option value="All Groups">All Groups</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>View</th>
              <th style={thStyle}>Icon</th>
              <th style={thStyle}>Device ID</th>
              <th style={thStyle}>Last Data Time</th>
              <th style={thStyle}>Latitude</th>
              <th style={thStyle}>Longitude</th>
              <th style={thStyle}>Temperature (°C)</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((entry) => (
              <tr key={entry.deviceId}>
                <td style={thTdStyle}>
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(entry.deviceId)}
                    onChange={() => handleDeviceToggle(entry.deviceId)}
                    disabled={entry.allInvalid}
                    style={entry.allInvalid ? { cursor: 'not-allowed' } : {}}
                  />
                </td>
                <td style={thTdStyle}>
                  <img
                    src={`https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${entry.color}.png`}
                    alt={`${entry.color} marker`}
                    style={{ width: '15px', height: '25px' }}
                  />
                </td>
                <td style={thTdStyle}>
                  <span style={deviceIdStyle(entry.deviceId)}>{entry.deviceId}</span>
                </td>
                <td style={thTdStyle}>{format(new Date(entry.lastTime), 'yyyy/MM/dd HH:mm:ss')}</td>
                <td style={thTdStyle}>{entry.lat.toFixed(4)}</td>
                <td style={thTdStyle}>{entry.lon.toFixed(4)}</td>
                <td style={thTdStyle}>{entry.temp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;