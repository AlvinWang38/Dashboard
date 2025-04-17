import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import axios from 'axios';
import Modal from 'react-modal';

// 使用環境變數設置後端基礎 URL
const BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// 綁定 Modal 到應用根元素
Modal.setAppElement('#root');

function DrawControl({ onCreated, existingCoordinates }) {
  const map = useMap();
  const drawControlRef = useRef(null);
  const featureGroupRef = useRef(null);

  useEffect(() => {
    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }

    // 如果有現有坐標（編輯模式），則顯示現有 Geofence
    if (existingCoordinates && existingCoordinates.length > 0) {
      const polygon = L.polygon(existingCoordinates);
      featureGroupRef.current.clearLayers();
      featureGroupRef.current.addLayer(polygon);
    }

    if (!drawControlRef.current) {
      const drawControl = new L.Control.Draw({
        draw: {
          polygon: true,
          polyline: false,
          rectangle: false,
          circle: false,
          marker: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: featureGroupRef.current,
          remove: true,
        },
      });

      map.addControl(drawControl);
      drawControlRef.current = drawControl;

      map.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;
        featureGroupRef.current.clearLayers();
        featureGroupRef.current.addLayer(layer);
        onCreated(layer);
      });

      map.on(L.Draw.Event.EDITED, (event) => {
        const layers = event.layers.getLayers();
        if (layers.length > 0) {
          onCreated(layers[0]);
        }
      });
    }

    return () => {
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
        drawControlRef.current = null;
      }
      if (featureGroupRef.current) {
        map.removeLayer(featureGroupRef.current);
        featureGroupRef.current = null;
      }
    };
  }, [map, onCreated, existingCoordinates]);

  return null;
}

// 縮圖組件：用於生成 Geofence 的地圖縮圖
function GeofenceThumbnail({ coordinates, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return;

    // 創建一個隱藏的 Leaflet 地圖，尺寸設為 200x200 像素
    const mapDiv = document.createElement('div');
    mapDiv.style.width = '200px'; // 增加尺寸以提升解析度
    mapDiv.style.height = '200px';
    mapDiv.style.position = 'absolute';
    mapDiv.style.visibility = 'hidden';
    document.body.appendChild(mapDiv);

    const map = L.map(mapDiv, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    });

    // 添加底圖，並添加錯誤處理
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
      tileSize: 256,
      maxZoom: 19,
    }).addTo(map);

    tileLayer.on('tileload', (e) => {
      console.log('Tile loaded successfully:', e.tile.src);
    });

    tileLayer.on('tileerror', (error) => {
      console.error('Tile loading failed:', error);
    });

    // 繪製 Geofence 多邊形
    const polygon = L.polygon(coordinates, {
      color: color,
      weight: 2,
      opacity: 0.5,
      fillOpacity: 0.2,
    }).addTo(map);

    // 計算邊界並縮放到適合的視圖
    const bounds = polygon.getBounds();
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });

    // 等待地圖圖塊加載完成後，將地圖渲染到 canvas
    map.whenReady(() => {
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const tiles = mapDiv.querySelectorAll('.leaflet-tile-loaded');
        console.log('Number of tiles loaded:', tiles.length);

        const mapSize = map.getSize();

        if (tiles.length === 0) {
          console.warn('No tiles loaded, map background may not be visible');
          // 繪製一個預設背景作為後備
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(0, 0, 100, 100);
        } else {
          // 先清空 canvas
          ctx.clearRect(0, 0, 100, 100);

          tiles.forEach((tile, index) => {
            const tilePos = map.latLngToContainerPoint(
              map.unproject([tile._leaflet_pos.x, tile._leaflet_pos.y], tile._zoom)
            );
            const tileSize = tile.width;
            let offsetX = tilePos.x;
            let offsetY = tilePos.y;

            // 調整縮放比例以適應 100x100 像素
            const scaleX = 100 / mapSize.x;
            const scaleY = 100 / mapSize.y;

            // 調整偏移量，確保圖塊在 canvas 範圍內
            offsetX = Math.max(0, Math.min(offsetX, mapSize.x));
            offsetY = Math.max(0, Math.min(offsetY, mapSize.y));

            console.log(`Drawing tile ${index}:`, {
              offsetX,
              offsetY,
              tileSize,
              scaledWidth: tileSize * scaleX,
              scaledHeight: tileSize * scaleY,
              tileSrc: tile.src,
            });

            try {
              ctx.drawImage(
                tile,
                offsetX * scaleX,
                offsetY * scaleY,
                tileSize * scaleX,
                tileSize * scaleY
              );
            } catch (error) {
              console.error(`Failed to draw tile ${index}:`, error);
            }
          });
        }

        // 直接在 canvas 上繪製多邊形
        ctx.beginPath();
        const points = coordinates.map(coord =>
          map.latLngToContainerPoint([coord[0], coord[1]])
        );
        points.forEach((point, index) => {
          const x = point.x * (100 / mapSize.x);
          const y = point.y * (100 / mapSize.y);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // 清理
        map.remove();
        document.body.removeChild(mapDiv);
      }, 2000);
    });
  }, [coordinates, color]);

  return <canvas ref={canvasRef} width={100} height={100} />;
}

function GeofenceManagement() {
  const [geofences, setGeofences] = useState([]);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' 或 'edit'
  const [currentGeofence, setCurrentGeofence] = useState({
    id: null,
    name: '',
    description: '',
    color: '#ff0000',
    coordinates: [],
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGeofences();
  }, []);

  const fetchGeofences = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/geofences`);
      setGeofences(response.data || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching geofences:', error);
      setError('Failed to fetch geofences. Please check if the backend is running.');
      setGeofences([]);
    }
  };

  const openModal = (mode, geofence = null) => {
    setModalMode(mode);
    if (mode === 'edit' && geofence) {
      setCurrentGeofence({
        id: geofence.id,
        name: geofence.name || '',
        description: geofence.description || '',
        color: geofence.color || '#ff0000',
        coordinates: geofence.coordinates || [],
      });
    } else {
      setCurrentGeofence({
        id: null,
        name: '',
        description: '',
        color: '#ff0000',
        coordinates: [],
      });
    }
    setModalIsOpen(true);
  };

  const closeModal = () => {
    setModalIsOpen(false);
    setCurrentGeofence({
      id: null,
      name: '',
      description: '',
      color: '#ff0000',
      coordinates: [],
    });
  };

  const handleDrawCreated = (layer) => {
    const latlngs = layer.getLatLngs()[0].map((latlng) => [latlng.lat, latlng.lng]);
    setCurrentGeofence((prev) => ({
      ...prev,
      coordinates: latlngs,
    }));
  };

  const handleSave = async () => {
    if (!currentGeofence.coordinates.length) {
      alert('Please draw a geofence on the map before saving.');
      return;
    }
    try {
      if (modalMode === 'add') {
        await axios.post(`${BASE_URL}/geofences`, currentGeofence);
      } else if (modalMode === 'edit') {
        await axios.put(`${BASE_URL}/geofences/${currentGeofence.id}`, currentGeofence);
      }
      closeModal();
      fetchGeofences();
    } catch (error) {
      console.error(`Error ${modalMode === 'add' ? 'saving' : 'updating'} geofence:`, error);
      setError(`Failed to ${modalMode === 'add' ? 'save' : 'update'} geofence. Please try again.`);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${BASE_URL}/geofences/${id}`);
      fetchGeofences();
    } catch (error) {
      console.error('Error deleting geofence:', error);
      setError('Failed to delete geofence. Please try again.');
    }
  };

  const modalStyles = {
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
      width: '80%',
      maxWidth: '800px',
      padding: '20px',
      borderRadius: '8px',
    },
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
  };

  const defaultCenter = [25.0591, 121.3822]; // 預設地圖中心

  // 計算 Geofence 的邊界（用於 Edit 模式）
  const getGeofenceBounds = (coordinates) => {
    if (!coordinates || coordinates.length === 0) return null;
    const latLngs = coordinates.map(coord => [coord[0], coord[1]]);
    return L.latLngBounds(latLngs);
  };

  return (
    <div style={{ marginLeft: '220px', padding: '20px', minHeight: '100vh' }}>
      <h1>Geofence Management</h1>
      <button
        onClick={() => openModal('add')}
        style={{ marginBottom: '10px', padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
      >
        Add Geofence
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        style={modalStyles}
        contentLabel={modalMode === 'add' ? 'Add Geofence' : 'Edit Geofence'}
      >
        <h2>{modalMode === 'add' ? 'Add New Geofence' : 'Edit Geofence'}</h2>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Name"
            value={currentGeofence.name}
            onChange={(e) => setCurrentGeofence({ ...currentGeofence, name: e.target.value })}
            style={{ marginRight: '10px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
          />
          <input
            type="text"
            placeholder="Description"
            value={currentGeofence.description}
            onChange={(e) => setCurrentGeofence({ ...currentGeofence, description: e.target.value })}
            style={{ marginRight: '10px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '200px' }}
          />
          <input
            type="color"
            value={currentGeofence.color}
            onChange={(e) => setCurrentGeofence({ ...currentGeofence, color: e.target.value })}
            style={{ padding: '2px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <MapContainer
          center={modalMode === 'add' || !currentGeofence.coordinates.length ? defaultCenter : undefined}
          bounds={modalMode === 'edit' && currentGeofence.coordinates.length ? getGeofenceBounds(currentGeofence.coordinates) : undefined}
          zoom={13}
          style={{ height: '600px', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <DrawControl onCreated={handleDrawCreated} existingCoordinates={currentGeofence.coordinates} />
        </MapContainer>
        <div style={{ marginTop: '10px', textAlign: 'right' }}>
          <button
            onClick={handleSave}
            style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Save
          </button>
          <button
            onClick={closeModal}
            style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px' }}
          >
            Cancel
          </button>
        </div>
      </Modal>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Name</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Map Preview</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Description</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Color</th>
            <th style={{ border: '1px solid #ccc', padding: '8px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {geofences.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                No geofences found.
              </td>
            </tr>
          ) : (
            geofences.map((geofence) => (
              <tr key={geofence.id}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{geofence.name || 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                  {geofence.coordinates && geofence.coordinates.length > 0 ? (
                    <GeofenceThumbnail coordinates={geofence.coordinates} color={geofence.color} />
                  ) : (
                    'N/A'
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{geofence.description || 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: geofence.color, marginRight: '5px' }}></div>
                    {geofence.color || 'N/A'}
                  </div>
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  <button
                    onClick={() => openModal('edit', geofence)}
                    style={{ marginRight: '5px', padding: '5px 10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(geofence.id)}
                    style={{ padding: '5px 10px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default GeofenceManagement;