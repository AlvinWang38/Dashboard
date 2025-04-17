const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
require('dotenv').config();

const messagesRouter = require('./routes/messages');
const groupsRouter = require('./routes/groups');
const devicesRouter = require('./routes/devices');
const geofencesRouter = require('./routes/geofences');

const app = express();
const port = process.env.PORT || 3000;

// 調整 CORS 配置，允許所有來源
app.use(cors({ origin: '*' }));
app.use(express.json());

// PostgreSQL 連線配置
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'dashboard_user',
  host: process.env.POSTGRES_HOST || 'postgres',
  database: process.env.POSTGRES_DB || 'dashboard_db',
  password: process.env.POSTGRES_PASSWORD || 'dashboard_password',
  port: 5432,
});

// 帶重試機制的連線函數
const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.connect();
      console.log('Connected to PostgreSQL');
      return;
    } catch (err) {
      console.error(`Failed to connect to PostgreSQL (attempt ${i + 1}/${retries}):`, err.message);
      if (i === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

connectWithRetry().catch((err) => {
  console.error('Failed to connect to PostgreSQL after retries:', err);
  process.exit(1);
});

// InfluxDB 配置
const token = process.env.INFLUXDB_TOKEN || 'my-token';
const org = process.env.INFLUXDB_ORG || 'myorg';
const bucket = process.env.INFLUXDB_BUCKET || 'products';
const client = new InfluxDB({ url: process.env.INFLUXDB_URL || 'http://influxdb:8086', token });
const writeApi = client.getWriteApi(org, bucket, 'ns');

// MQTT 客戶端配置
const mqttClient = mqtt.connect({
  host: process.env.MQTT_HOST || '220.130.157.88',
  port: parseInt(process.env.MQTT_PORT) || 1883,
  username: process.env.MQTT_USERNAME || 'LEOS',
  password: process.env.MQTT_PASSWORD || 'p@ssw0rd',
});
let mqttConnected = false;

function decodeDataPayload(payload) {
  const buffer = Buffer.from(payload, 'base64');
  if (buffer[0] !== 0xA5) {
    console.error('Invalid header, expected 0xA5');
    return null;
  }
  const size = buffer[1];
  const count = buffer[2];
  const results = [];

  for (let i = 0; i < count; i++) {
    const start = i * size + 4;
    const subArray = buffer.slice(start, start + size);
    const [log_ts, la, lg, tmp, tiltx, tilty, tiltz, corev, liionv] = [
      subArray.readUInt32LE(0),
      subArray.readInt32LE(4),
      subArray.readInt32LE(8),
      subArray.readInt16LE(12),
      subArray.readInt8(14),
      subArray.readInt8(15),
      subArray.readInt8(16),
      subArray.readUInt8(17),
      subArray.readUInt8(18),
    ];
    results.push({
      log_ts,
      la: la * 0.000001,
      lg: lg * 0.000001,
      tmp: tmp * 0.01,
      tiltx,
      tilty,
      tiltz,
      corev: corev * 0.1,
      liionv: liionv * 0.1,
    });
  }
  return results;
}

function decodeNotifyPayload(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const payloadLen = buffer.length;
  let fields = {};

  if (payloadLen === 92) {
    const [gnssft, txtime, solar_v, ax, ay, az, gx, gy, gz, cn_no, cn_total, cn_max, cn_min, csp, csq, bat_src, wakeup, wwan_t, cpin_t, reg_t, ack_t, fw_ver_raw, next_t] = [
      buffer.readInt32LE(0),
      buffer.readUInt32LE(4),
      buffer.readUInt32LE(8),
      buffer.readFloatLE(12),
      buffer.readFloatLE(16),
      buffer.readFloatLE(20),
      buffer.readFloatLE(24),
      buffer.readFloatLE(28),
      buffer.readFloatLE(32),
      buffer.readInt32LE(36),
      buffer.readInt32LE(40),
      buffer.readInt32LE(44),
      buffer.readInt32LE(48),
      buffer.readInt32LE(52),
      buffer.readInt32LE(56),
      buffer.readInt32LE(60),
      buffer.readInt32LE(64),
      buffer.readUInt32LE(68),
      buffer.readUInt32LE(72),
      buffer.readUInt32LE(76),
      buffer.readUInt32LE(80),
      buffer.readUInt32LE(84),
      buffer.readUInt32LE(88),
    ];
    const fw_ver = `${(fw_ver_raw >> 24) & 0xff}.${(fw_ver_raw >> 16) & 0xff}.${(fw_ver_raw >> 8) & 0xff}`;
    fields = {
      gnssft: gnssft === -1 ? -10.0 : gnssft / 1000,
      txtime: txtime / 1000,
      solar_v: solar_v * 0.001,
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      cn_no,
      cn_total,
      cn_max,
      cn_min,
      cn_avg: cn_no > 0 ? cn_total / cn_no : 0,
      csp,
      csq,
      bat_src,
      wakeup,
      wwan_t: wwan_t / 1000,
      cpin_t: cpin_t / 1000,
      reg_t: reg_t / 1000,
      ack_t: ack_t / 1000,
      fw_ver,
      next_t: next_t * 1000,
    };
  } else if (payloadLen === 100) {
    const [gnssft, txtime, solar_v, ax, ay, az, gx, gy, gz, cn_no, cn_total, cn_max, cn_min, csp, csq, bat_src, wakeup, wwan_t, cpin_t, reg_t, ack_t, fw_ver_raw, next_t, crsp, crsq] = [
      buffer.readInt32LE(0),
      buffer.readUInt32LE(4),
      buffer.readUInt32LE(8),
      buffer.readFloatLE(12),
      buffer.readFloatLE(16),
      buffer.readFloatLE(20),
      buffer.readFloatLE(24),
      buffer.readFloatLE(28),
      buffer.readFloatLE(32),
      buffer.readInt32LE(36),
      buffer.readInt32LE(40),
      buffer.readInt32LE(44),
      buffer.readInt32LE(48),
      buffer.readInt32LE(52),
      buffer.readInt32LE(56),
      buffer.readInt32LE(60),
      buffer.readInt32LE(64),
      buffer.readUInt32LE(68),
      buffer.readUInt32LE(72),
      buffer.readUInt32LE(76),
      buffer.readUInt32LE(80),
      buffer.readUInt32LE(84),
      buffer.readUInt32LE(88),
      buffer.readInt32LE(92),
      buffer.readInt32LE(96),
    ];
    const fw_ver = `${(fw_ver_raw >> 24) & 0xff}.${(fw_ver_raw >> 16) & 0xff}.${(fw_ver_raw >> 8) & 0xff}`;
    fields = {
      gnssft: gnssft === -1 ? -10.0 : gnssft / 1000,
      txtime: txtime / 1000,
      solar_v: solar_v * 0.001,
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      cn_no,
      cn_total,
      cn_max,
      cn_min,
      cn_avg: cn_no > 0 ? cn_total / cn_no : 0,
      csp,
      csq,
      bat_src,
      wakeup,
      wwan_t: wwan_t / 1000,
      cpin_t: cpin_t / 1000,
      reg_t: reg_t / 1000,
      ack_t: ack_t / 1000,
      fw_ver,
      next_t: next_t * 1000,
      crsp,
      crsq,
    };
  }
  return fields;
}

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttConnected = true;
  mqttClient.subscribe(['adv/+/data', 'adv/+/notify'], (err) => {
    if (!err) {
      console.log('Subscribed to adv/+/data and adv/+/notify');
    } else {
      console.error('Failed to subscribe to MQTT topics:', err);
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('MQTT connection error:', err);
  mqttConnected = false;
});

mqttClient.on('close', () => {
  console.log('Disconnected from MQTT broker');
  mqttConnected = false;
});

mqttClient.on('message', (topic, message) => {
  const messageStr = message.toString();
  console.log(`Received message on ${topic}: ${messageStr}`);

  const topicParts = topic.split('/');
  const deviceId = topicParts[1];
  const type = topicParts[2];
  let j;
  try {
    j = JSON.parse(messageStr);
  } catch (e) {
    console.error('JSON parse error:', e);
    return;
  }

  if (type === 'data') {
    const decoded = decodeDataPayload(j.data);
    if (decoded) {
      decoded.forEach((data) => {
        const point = new Point('device_messages')
          .tag('device_id', deviceId)
          .tag('type', type)
          .intField('id', parseInt(j.msg.id))
          .intField('ts', parseInt(j.msg.ts))
          .stringField('imei', j.msg.imei || deviceId)
          .stringField('oper', j.net.oper)
          .stringField('ip', j.net.ip)
          .stringField('remark', j.remark)
          .intField('log_ts', data.log_ts)
          .floatField('la', data.la)
          .floatField('lg', data.lg)
          .floatField('tmp', data.tmp)
          .intField('tiltx', data.tiltx)
          .intField('tilty', data.tilty)
          .intField('tiltz', data.tiltz)
          .floatField('corev', data.corev)
          .floatField('liionv', data.liionv);
        writeApi.writePoint(point);
      });
    }
  } else if (type === 'notify' && j.notify === 'eng') {
    const decoded = decodeNotifyPayload(j.value);
    if (decoded) {
      const point = new Point('device_messages')
        .tag('device_id', deviceId)
        .tag('type', type)
        .intField('id', parseInt(j.msg.id))
        .intField('ts', parseInt(j.msg.ts))
        .stringField('oper', j.net.oper)
        .stringField('ip', j.net.ip)
        .floatField('gnssft', decoded.gnssft)
        .floatField('txtime', decoded.txtime)
        .floatField('solar_v', decoded.solar_v)
        .floatField('ax', decoded.ax)
        .floatField('ay', decoded.ay)
        .floatField('az', decoded.az)
        .floatField('gx', decoded.gx)
        .floatField('gy', decoded.gy)
        .floatField('gz', decoded.gz)
        .intField('cn_no', decoded.cn_no)
        .intField('cn_total', decoded.cn_total)
        .intField('cn_max', decoded.cn_max)
        .intField('cn_min', decoded.cn_min)
        .floatField('cn_avg', decoded.cn_avg)
        .intField('csp', decoded.csp)
        .intField('csq', decoded.csq)
        .intField('bat_src', decoded.bat_src)
        .intField('wakeup', decoded.wakeup)
        .floatField('wwan_t', decoded.wwan_t)
        .floatField('cpin_t', decoded.cpin_t)
        .floatField('reg_t', decoded.reg_t)
        .floatField('ack_t', decoded.ack_t)
        .stringField('fw_ver', decoded.fw_ver)
        .floatField('next_t', decoded.next_t);
      if (decoded.crsp !== undefined) {
        point.intField('crsp', decoded.crsp).intField('crsq', decoded.crsq);
      }
      writeApi.writePoint(point);
    }
  }

  writeApi.flush().then(() => {
    console.log(`Data written to InfluxDB for ${topic}`);
  }).catch((err) => console.error('InfluxDB write error:', err));
});

// 路由
app.use('/messages', messagesRouter);
app.use('/groups', groupsRouter);
app.use('/devices', devicesRouter);
app.use('/geofences', geofencesRouter);

// 健康檢查端點
app.get('/health', (req, res) => {
  res.status(200).json({ message: 'Backend is running' });
});

// MQTT 狀態路由
app.get('/mqtt-status', (req, res) => {
  res.json({ connected: mqttConnected });
});

// 獲取設備設定
app.get('/devices/:deviceId/settings', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM device_settings WHERE device_id = $1', [deviceId]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json({
        group_name: 'default',
        container_id: '',
        tractor_id: '',
        geofence_setting: 'None',
        label_color: '#000000',
      });
    }
  } catch (error) {
    console.error('Error fetching settings:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// 儲存設備設定
app.post('/devices/:deviceId/settings', async (req, res) => {
  const { deviceId } = req.params;
  const { group, containerId, tractorId, geofence, labelColor } = req.body;
  console.log(`Received POST request to /devices/${deviceId}/settings with data:`, { group, containerId, tractorId, geofence, labelColor });
  try {
    await pool.query(
      `INSERT INTO device_settings (device_id, group_name, container_id, tractor_id, geofence_setting, label_color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (device_id)
       DO UPDATE SET
         group_name = $2,
         container_id = $3,
         tractor_id = $4,
         geofence_setting = $5,
         label_color = $6,
         updated_at = CURRENT_TIMESTAMP`,
      [deviceId, group, containerId, tractorId, geofence, labelColor]
    );
    console.log(`Settings saved to PostgreSQL for device ${deviceId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to save settings', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});