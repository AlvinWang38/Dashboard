const express = require('express');
const router = express.Router();
const { InfluxDB } = require('@influxdata/influxdb-client');
const NodeCache = require('node-cache');
const { Pool } = require('pg');
require('dotenv').config();

// 初始化快取，設置 TTL 為 30 秒
const cache = new NodeCache({ stdTTL: 30, checkperiod: 10 });

// InfluxDB 配置
const token = process.env.INFLUXDB_TOKEN || 'my-token';
const org = process.env.INFLUXDB_ORG || 'myorg';
const bucket = process.env.INFLUXDB_BUCKET || 'products';
const client = new InfluxDB({ url: process.env.INFLUXDB_URL || 'http://influxdb:8086', token });

// PostgreSQL 配置
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'dashboard_user',
  host: process.env.POSTGRES_HOST || 'postgres',
  database: process.env.POSTGRES_DB || 'dashboard_db',
  password: process.env.POSTGRES_PASSWORD || 'dashboard_password',
  port: 5432,
});

// 檢查點是否在多邊形內的函數
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

router.get('/', async (req, res) => {
  const queryApi = client.getQueryApi(org);

  // 根據查詢參數生成快取鍵
  const cacheKey = req.query.from && req.query.to
    ? `messages_${req.query.from}_${req.query.to}`
    : `messages_${req.query.range || '1h'}`;

  // 添加日誌：檢查查詢參數和快取鍵
  console.log('Messages API request:', { queryParams: req.query, cacheKey });

  // 檢查快取中是否有數據
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log('Returning cached data for:', cacheKey);
    return res.json(cachedData);
  }

  let query;

  // 檢查是否有 from 和 to 參數（自訂時間範圍）
  if (req.query.from && req.query.to) {
    const from = req.query.from;
    const to = req.query.to;
    query = `from(bucket: "${bucket}")
      |> range(start: ${from}, stop: ${to})
      |> filter(fn: (r) => r._measurement == "device_messages")
      |> filter(fn: (r) => r._field != "message")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> limit(n: 1000)`; // 限制返回數據量
  } else {
    // 預設使用 range 參數（相對時間範圍）
    const range = req.query.range || '1h';
    query = `from(bucket: "${bucket}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._measurement == "device_messages")
      |> filter(fn: (r) => r._field != "message")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> limit(n: 1000)`; // 限制返回數據量
  }

  const results = { data: [], notify: [] };

  queryApi.queryRows(query, {
    next(row, tableMeta) {
      const o = tableMeta.toObject(row);
      // 添加日誌：檢查每筆查詢到的資料，特別是 353500725489142
      if (o.device_id === '353500725489142') {
        console.log('Query row for 353500725489142:', o);
      }
      const entry = {
        time: o._time,
        device_id: o.device_id,
        id: o.id,
        ts: o.ts,
        imei: o.imei || '',
        oper: o.oper || '',
        ip: o.ip || '',
      };
      if (o.type === 'data' && o.log_ts !== undefined) {
        entry.remark = o.remark || '';
        entry.log_ts = o.log_ts;
        entry.la = o.la || 0;
        entry.lg = o.lg || 0;
        entry.tmp = o.tmp || 0;
        entry.tiltx = o.tiltx || 0;
        entry.tilty = o.tilty || 0;
        entry.tiltz = o.tiltz || 0;
        entry.corev = o.corev || 0;
        entry.liionv = o.liionv || 0;
        results.data.push(entry);
      } else if (o.type === 'notify' && o.gnssft !== undefined) {
        entry.gnssft = o.gnssft;
        entry.txtime = o.txtime;
        entry.solar_v = o.solar_v;
        entry.ax = o.ax;
        entry.ay = o.ay;
        entry.az = o.az;
        entry.gx = o.gx;
        entry.gy = o.gy;
        entry.gz = o.gz;
        entry.cn_no = o.cn_no;
        entry.cn_total = o.cn_total;
        entry.cn_max = o.cn_max;
        entry.cn_min = o.cn_min;
        entry.cn_avg = o.cn_avg;
        entry.csp = o.csp;
        entry.csq = o.csq;
        entry.bat_src = o.bat_src;
        entry.wakeup = o.wakeup;
        entry.wwan_t = o.wwan_t;
        entry.cpin_t = o.cpin_t;
        entry.reg_t = o.reg_t;
        entry.ack_t = o.ack_t;
        entry.fw_ver = o.fw_ver;
        entry.next_t = o.next_t;
        entry.crsp = o.crsp !== undefined ? o.crsp : null;
        entry.crsq = o.crsq !== undefined ? o.crsq : null;
        results.notify.push(entry);
      }
    },
    error(error) {
      console.error('InfluxDB query error:', error.message, error.stack);
      res.status(500).json({ error: 'Failed to query InfluxDB', details: error.message });
    },
    async complete() {
      console.log('Query complete:', results);

      // 按 device_id 分組並排序，找到每個設備的最後一筆有效資料
      const groupedData = results.data.reduce((acc, msg) => {
        const deviceId = msg.device_id;
        if (!acc[deviceId]) {
          acc[deviceId] = [];
        }
        acc[deviceId].push(msg);
        return acc;
      }, {});

      // 儲存每個設備是否在 geofence 內的結果
      const devicesInGeofence = {};

      // 對每個設備進行 geofence 檢查
      for (const deviceId of Object.keys(groupedData)) {
        // 按時間排序，確保最新資料在最後
        groupedData[deviceId].sort((a, b) => new Date(b.time) - new Date(a.time));

        // 找到最後一筆有效座標（la 和 lg 都不是 255）
        let lastValidPoint = null;
        for (const msg of groupedData[deviceId]) {
          if (msg.la !== 255 && msg.lg !== 255) {
            lastValidPoint = msg;
            break;
          }
        }

        // 添加日誌：檢查 353500725489142 的有效座標
        if (deviceId === '353500725489142') {
          console.log('Last valid point for 353500725489142:', lastValidPoint);
        }

        // 如果沒有有效座標，跳過 geofence 檢查
        if (!lastValidPoint) {
          devicesInGeofence[deviceId] = false;
          continue;
        }

        // 從 PostgreSQL 查詢設備的 geofence_setting
        let geofenceId;
        try {
          const deviceSettingsResult = await pool.query(
            'SELECT geofence_setting FROM device_settings WHERE device_id = $1',
            [deviceId]
          );
          if (deviceSettingsResult.rowCount === 0 || deviceSettingsResult.rows[0].geofence_setting === null) {
            devicesInGeofence[deviceId] = false;
            continue;
          }
          geofenceId = deviceSettingsResult.rows[0].geofence_setting;
        } catch (error) {
          console.error(`Error fetching geofence_setting for device ${deviceId}:`, error.message);
          devicesInGeofence[deviceId] = false;
          continue;
        }

        // 查詢 geofence 的 coordinates
        let coordinates;
        try {
          const geofenceResult = await pool.query(
            'SELECT coordinates FROM geofences WHERE id = $1',
            [geofenceId]
          );
          if (geofenceResult.rowCount === 0) {
            devicesInGeofence[deviceId] = false;
            continue;
          }
          coordinates = geofenceResult.rows[0].coordinates; // 已經是 JSON 格式
        } catch (error) {
          console.error(`Error fetching geofence coordinates for geofence ${geofenceId}:`, error.message);
          devicesInGeofence[deviceId] = false;
          continue;
        }

        // 檢查設備是否在 geofence 內
        const isInside = isPointInPolygon([lastValidPoint.la, lastValidPoint.lg], coordinates);
        devicesInGeofence[deviceId] = isInside;

        // 添加日誌：檢查 353500725489142 的 geofence 狀態
        if (deviceId === '353500725489142') {
          console.log('Geofence check for 353500725489142:', { isInside, coordinates });
        }
      }

      // 在每筆資料中添加 inGeofence 欄位
      results.data = results.data.map((msg) => ({
        ...msg,
        inGeofence: devicesInGeofence[msg.device_id] || false,
      }));

      // 添加日誌：檢查 353500725489142 的最終資料
      const deviceData = results.data.filter(msg => msg.device_id === '353500725489142');
      console.log('Final data for 353500725489142:', deviceData);

      // 將查詢結果存入快取
      cache.set(cacheKey, results);
      res.json(results);
    },
  });
});

module.exports = router;