import axios from 'axios';
import { format } from 'date-fns';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCog } from 'react-icons/fa';

// 使用環境變數設置後端基礎 URL
const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const colorOptions = [
  { name: 'red', hex: '#ff0000' },
  { name: 'green', hex: '#00ff00' },
  { name: 'blue', hex: '#0000ff' },
  { name: 'violet', hex: '#ee82ee' },
  { name: 'orange', hex: '#ffa500' },
  { name: 'purple', hex: '#800080' },
  { name: 'yellow', hex: '#ffff00' },
  { name: 'black', hex: '#000000' },
  { name: 'gold', hex: '#ffd700' },
];

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

const DeviceManagement = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [groups, setGroups] = useState(['default']);
  const [geofences, setGeofences] = useState([]);
  const [newGroup, setNewGroup] = useState('');
  const [formData, setFormData] = useState({
    group: 'default',
    containerId: '',
    tractorId: '',
    geofenceId: null,
    labelColor: '#000000',
    customName: '',
    licensePlate: '',
    driver: '',
    phone: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const groupsRes = await axios.get(`${BASE_URL}/groups`);
        setGroups(groupsRes.data || ['default']);

        const geofencesRes = await axios.get(`${BASE_URL}/geofences`);
        setGeofences(geofencesRes.data || []);

        const res = await axios.get(`${BASE_URL}/messages`);
        const data = res.data.data || [];

        const groupedData = data.reduce((acc, msg) => {
          const deviceId = msg.device_id;
          if (!acc[deviceId]) {
            acc[deviceId] = [];
          }
          acc[deviceId].push(msg);
          return acc;
        }, {});

        const deviceList = Object.keys(groupedData).map((deviceId) => {
          const deviceMessages = groupedData[deviceId];
          deviceMessages.sort((a, b) => new Date(b.time) - new Date(a.time));
          const latestMessage = deviceMessages[0];
          return {
            deviceId,
            lastSeen: latestMessage.time,
            lat: latestMessage.la,
            lon: latestMessage.lg,
            corev: latestMessage.corev,
            liionv: latestMessage.liionv,
          };
        });

        const devicesWithSettings = await Promise.all(
          deviceList.map(async (device) => {
            try {
              const response = await axios.get(`${BASE_URL}/devices/${device.deviceId}/settings`);
              const settings = response.data;
              return {
                ...device,
                group: settings.group_name || 'default',
                containerId: settings.container_id || '',
                tractorId: settings.tractor_id || '',
                geofenceId: settings.geofence_id || null,
                labelColor: settings.label_color || '#000000',
                customName: settings.custom_name || '',
                licensePlate: settings.license_plate || '',
                driver: settings.driver || '',
                phone: settings.phone || '',
              };
            } catch (error) {
              console.error(`Error fetching settings for device ${device.deviceId}:`, error);
              return {
                ...device,
                group: 'default',
                containerId: '',
                tractorId: '',
                geofenceId: null,
                labelColor: '#000000',
                customName: '',
                licensePlate: '',
                driver: '',
                phone: '',
              };
            }
          })
        );

        devicesWithSettings.sort((a, b) => a.deviceId.localeCompare(b.deviceId));
        setDevices(devicesWithSettings);
        setError(null);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError('Failed to fetch device data. Please check if the backend is running.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatTime = (isoTime) => {
    try {
      return format(new Date(isoTime), 'yyyy/MM/dd HH:mm:ss');
    } catch {
      return 'Invalid time';
    }
  };

  const handleSettingsClick = async (device) => {
    setSelectedDevice(device);
    try {
      const response = await axios.get(`${BASE_URL}/devices/${device.deviceId}/settings`);
      const settings = response.data;
      setFormData({
        group: settings.group_name || 'default',
        containerId: settings.container_id || '',
        tractorId: settings.tractor_id || '',
        geofenceId: settings.geofence_id || null,
        labelColor: settings.label_color || '#000000',
        customName: settings.custom_name || '',
        licensePlate: settings.license_plate || '',
        driver: settings.driver || '',
        phone: settings.phone || '',
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      setFormData({
        group: 'default',
        containerId: '',
        tractorId: '',
        geofenceId: null,
        labelColor: '#000000',
        customName: '',
        licensePlate: '',
        driver: '',
        phone: '',
      });
    }
    setIsPopupOpen(true);
  };

  const closePopup = () => {
    setIsPopupOpen(false);
    setSelectedDevice(null);
    setNewGroup('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddGroup = async () => {
    if (newGroup.trim() && !groups.includes(newGroup.trim())) {
      try {
        await axios.post(`${BASE_URL}/groups`, { groupName: newGroup.trim() });
        // 重新從後端獲取群組列表，確保包含 default 和所有群組
        const groupsRes = await axios.get(`${BASE_URL}/groups`);
        setGroups(groupsRes.data || ['default']);
        setFormData((prev) => ({ ...prev, group: newGroup.trim() }));
        setNewGroup('');
      } catch (error) {
        console.error('Error adding group:', error);
      }
    }
  };

  const handleSave = async () => {
    try {
      const response = await axios.post(`${BASE_URL}/devices/${selectedDevice.deviceId}/settings`, {
        group: formData.group,
        containerId: formData.containerId,
        tractorId: formData.tractorId,
        geofenceId: formData.geofenceId === 'None' ? null : parseInt(formData.geofenceId),
        labelColor: formData.labelColor,
        customName: formData.customName,
        licensePlate: formData.licensePlate,
        driver: formData.driver,
        phone: formData.phone,
      });
      console.log('Settings saved:', response.data);

      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.deviceId === selectedDevice.deviceId
            ? {
                ...device,
                group: formData.group,
                containerId: formData.containerId,
                tractorId: formData.tractorId,
                geofenceId: formData.geofenceId === 'None' ? null : parseInt(formData.geofenceId),
                labelColor: formData.labelColor,
                customName: formData.customName,
                licensePlate: formData.licensePlate,
                driver: formData.driver,
                phone: formData.phone,
              }
            : device
        )
      );

      closePopup();
    } catch (error) {
      console.error('Error saving settings:', error.response ? error.response.data : error.message);
      setError('Failed to save settings. Please try again.');
    }
  };

  const handleDeviceClick = (deviceId) => {
    navigate(`/dashboard?deviceId=${deviceId}`);
  };

  const containerStyle = {
    marginLeft: '220px',
    padding: '20px',
    minHeight: '100vh',
  };

  const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
    marginTop: '10px',
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

  const popupOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const popupContentStyle = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '5px',
    width: '400px',
    maxHeight: '80vh',
    overflowY: 'auto',
    position: 'relative',
  };

  const closeButtonStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
  };

  const formGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '15px',
  };

  const labelStyle = {
    marginBottom: '5px',
    fontWeight: 'bold',
  };

  const inputStyle = {
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    width: '100%',
    boxSizing: 'border-box',
  };

  const selectStyle = {
    ...inputStyle,
  };

  const addGroupStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const colorSelectStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  };

  const buttonStyle = {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '10px',
  };

  const gearStyle = {
    cursor: 'pointer',
    color: '#007bff',
  };

  const deviceIdStyle = {
    cursor: 'pointer',
    color: '#007bff',
    textDecoration: 'underline',
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Device Management</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? (
        <p>Loading devices...</p>
      ) : devices.length === 0 ? (
        <p>No devices found.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Icon</th>
              <th style={thStyle}>Custom Name</th>
              <th style={thStyle}>Device ID</th>
              <th style={thStyle}>Last Seen Time</th>
              <th style={thStyle}>Group</th>
              <th style={thStyle}>Container ID</th>
              <th style={thStyle}>Tractor ID</th>
              <th style={thStyle}>License Plate</th>
              <th style={thStyle}>Driver</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Geofence</th>
              <th style={thStyle}>Settings</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.deviceId}>
                <td style={thTdStyle}>
                  <img
                    src={`https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${colorMap[device.labelColor] || 'black'}.png`}
                    alt={`${colorMap[device.labelColor] || 'black'} marker`}
                    style={{ width: '15px', height: '25px' }}
                  />
                </td>
                <td style={thTdStyle}>{device.customName}</td>
                <td style={thTdStyle}>
                  <span
                    style={deviceIdStyle}
                    onClick={() => handleDeviceClick(device.deviceId)}
                  >
                    {device.deviceId}
                  </span>
                </td>
                <td style={thTdStyle}>{formatTime(device.lastSeen)}</td>
                <td style={thTdStyle}>{device.group}</td>
                <td style={thTdStyle}>{device.containerId}</td>
                <td style={thTdStyle}>{device.tractorId}</td>
                <td style={thTdStyle}>{device.licensePlate}</td>
                <td style={thTdStyle}>{device.driver}</td>
                <td style={thTdStyle}>{device.phone}</td>
                <td style={thTdStyle}>
                  {device.geofenceId
                    ? geofences.find((g) => g.id === device.geofenceId)?.name || 'Unknown'
                    : 'None'}
                </td>
                <td style={thTdStyle}>
                  <FaCog style={gearStyle} onClick={() => handleSettingsClick(device)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isPopupOpen && selectedDevice && (
        <div style={popupOverlayStyle}>
          <div style={popupContentStyle}>
            <button style={closeButtonStyle} onClick={closePopup}>
              ✕
            </button>
            <h3>Settings for Device: {selectedDevice.deviceId}</h3>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Custom Name</label>
              <input
                type="text"
                name="customName"
                value={formData.customName}
                onChange={handleInputChange}
                style={inputStyle}
                maxLength={30}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Group</label>
              <div style={addGroupStyle}>
                <select
                  name="group"
                  value={formData.group}
                  onChange={handleInputChange}
                  style={selectStyle}
                >
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="New Group"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  style={{ ...inputStyle, width: '120px' }}
                />
                <button
                  onClick={handleAddGroup}
                  style={{ ...buttonStyle, padding: '8px' }}
                  disabled={!newGroup.trim()}
                >
                  Add
                </button>
              </div>
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Container ID</label>
              <input
                type="text"
                name="containerId"
                value={formData.containerId}
                onChange={handleInputChange}
                style={inputStyle}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Tractor ID</label>
              <input
                type="text"
                name="tractorId"
                value={formData.tractorId}
                onChange={handleInputChange}
                style={inputStyle}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>License Plate</label>
              <input
                type="text"
                name="licensePlate"
                value={formData.licensePlate}
                onChange={handleInputChange}
                style={inputStyle}
                maxLength={30}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Driver</label>
              <input
                type="text"
                name="driver"
                value={formData.driver}
                onChange={handleInputChange}
                style={inputStyle}
                maxLength={30}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Phone</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                style={inputStyle}
                maxLength={30}
              />
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Geofence</label>
              <select
                name="geofenceId"
                value={formData.geofenceId || 'None'}
                onChange={handleInputChange}
                style={selectStyle}
              >
                <option value="None">None</option>
                {geofences.map((geofence) => (
                  <option key={geofence.id} value={geofence.id}>
                    {geofence.name || `Geofence ${geofence.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Label Color</label>
              <div style={colorSelectStyle}>
                <select
                  name="labelColor"
                  value={formData.labelColor}
                  onChange={handleInputChange}
                  style={selectStyle}
                >
                  {colorOptions.map((color) => (
                    <option key={color.hex} value={color.hex}>
                      {color.name}
                    </option>
                  ))}
                </select>
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: formData.labelColor,
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <button onClick={handleSave} style={buttonStyle}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceManagement;