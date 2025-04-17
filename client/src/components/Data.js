import axios from 'axios';
import { format } from 'date-fns';
import { useState, useEffect, useCallback } from 'react';
import TimeRangePicker from '../TimeRangePicker';

// 使用環境變數設置後端基礎 URL
const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const Data = () => {
  const [messages, setMessages] = useState([]);
  const [mqttStatus, setMqttStatus] = useState('Checking...');
  const [refreshInterval, setRefreshInterval] = useState(0); // 預設為 "Not Refresh"
  const [expandedDevices, setExpandedDevices] = useState([]);

  const fetchMessages = useCallback(async (timeRange) => {
    let url = `${BASE_URL}/messages`;
    if (timeRange.type === 'relative') {
      url += `?range=${timeRange.value}`;
    } else if (timeRange.type === 'custom') {
      url += `?from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;
    }

    const res = await axios.get(url);
    console.log('Messages:', res.data);
    const sortedData = [...res.data.data].sort((a, b) => new Date(b.time) - new Date(a.time));
    setMessages(sortedData);
  }, []);

  const fetchMqttStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE_URL}/mqtt-status`);
      setMqttStatus(res.data.connected ? 'Connected' : 'Disconnected');
    } catch (error) {
      setMqttStatus('Error');
    }
  }, []);

  const handleTimeRangeChange = (timeRange) => {
    fetchMessages(timeRange);
  };

  useEffect(() => {
    fetchMessages({ type: 'relative', value: '1h' });
    fetchMqttStatus();
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchMessages({ type: 'relative', value: '1h' });
        fetchMqttStatus();
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchMessages, fetchMqttStatus]);

  const handleRefreshChange = (e) => {
    setRefreshInterval(parseInt(e.target.value, 10));
  };

  const toggleDevice = (deviceId) => {
    setExpandedDevices((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  const formatTime = (isoTime) => {
    return format(new Date(isoTime), 'yyyy/MM/dd HH:mm:ss');
  };

  const groupedMessages = messages.reduce((acc, msg) => {
    if (!acc[msg.device_id]) {
      acc[msg.device_id] = [];
    }
    acc[msg.device_id].push(msg);
    return acc;
  }, {});

  const containerStyle = {
    marginLeft: '220px',
    padding: '20px',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  };

  const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
    marginBottom: '20px',
  };

  const thTdStyle = {
    border: '1px solid #ddd',
    padding: '8px',
    textAlign: 'left',
    minWidth: '100px',
  };

  const thStyle = {
    ...thTdStyle,
    backgroundColor: '#f2f2f2',
    fontWeight: 'bold',
  };

  const deviceHeaderStyle = {
    cursor: 'pointer',
    padding: '10px',
    backgroundColor: '#e9ecef',
    marginBottom: '5px',
  };

  return (
    <div style={containerStyle}>
      <h1>Data</h1>
      <div style={headerStyle}>
        <p>MQTT Status: {mqttStatus}</p>
        <label>
          Refresh Interval:
          <select value={refreshInterval} onChange={handleRefreshChange} style={{ marginLeft: '5px' }}>
            <option value={0}>Not Refresh</option>
            <option value={30000}>30 seconds</option>
            <option value={60000}>1 minute</option>
            <option value={300000}>5 minutes</option>
          </select>
        </label>
        <TimeRangePicker onTimeRangeChange={handleTimeRangeChange} />
      </div>
      <h2>Data Messages</h2>
      {Object.keys(groupedMessages).map((deviceId) => (
        <div key={deviceId}>
          <div style={deviceHeaderStyle} onClick={() => toggleDevice(deviceId)}>
            Device ID: {deviceId} {expandedDevices.includes(deviceId) ? '▲' : '▼'}
          </div>
          {expandedDevices.includes(deviceId) && (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>TS</th>
                  <th style={thStyle}>IMEI</th>
                  <th style={thStyle}>Operator</th>
                  <th style={thStyle}>IP</th>
                  <th style={thStyle}>Log TS</th>
                  <th style={thStyle}>Latitude</th>
                  <th style={thStyle}>Longitude</th>
                  <th style={thStyle}>Temperature</th>
                  <th style={thStyle}>Tilt X</th>
                  <th style={thStyle}>Tilt Y</th>
                  <th style={thStyle}>Tilt Z</th>
                  <th style={thStyle}>Core Voltage</th>
                  <th style={thStyle}>Li-ion Voltage</th>
                  <th style={thStyle}>Remark</th>
                </tr>
              </thead>
              <tbody>
                {groupedMessages[deviceId].map((msg, i) => (
                  <tr key={i}>
                    <td style={thTdStyle}>{formatTime(msg.time)}</td>
                    <td style={thTdStyle}>{msg.id}</td>
                    <td style={thTdStyle}>{msg.ts}</td>
                    <td style={thTdStyle}>{msg.imei}</td>
                    <td style={thTdStyle}>{msg.oper}</td>
                    <td style={thTdStyle}>{msg.ip}</td>
                    <td style={thTdStyle}>{msg.log_ts}</td>
                    <td style={thTdStyle}>{msg.la}</td>
                    <td style={thTdStyle}>{msg.lg}</td>
                    <td style={thTdStyle}>{msg.tmp}</td>
                    <td style={thTdStyle}>{msg.tiltx}</td>
                    <td style={thTdStyle}>{msg.tilty}</td>
                    <td style={thTdStyle}>{msg.tiltz}</td>
                    <td style={thTdStyle}>{msg.corev}</td>
                    <td style={thTdStyle}>{msg.liionv}</td>
                    <td style={thTdStyle}>{msg.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
};

export default Data;