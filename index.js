const express = require('express');
const cors = require('cors');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const mqtt = require('mqtt');

const app = express();
app.use(express.json());
app.use(cors());

const token = 'my-token';
const org = 'myorg';
const bucket = 'products';
const client = new InfluxDB({ url: 'http://influxdb:8086', token });
const writeApi = client.getWriteApi(org, bucket, 'ns');

const mqttClient = mqtt.connect('mqtt://220.130.157.88:1883', {
  username: 'LEOS',
  password: 'p@ssw0rd'
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
      liionv: liionv * 0.1
    });
  }
  return results;
}

function decodeNotifyPayload(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const payloadLen = buffer.length;
  let fields = {};

  if (payloadLen === 92) {
    const [gnssft, txtime, solar_v, ax, ay, az, gx, gy, gz, cn_no, cn_total, cn_max, cn_min, csp, csq, bat_src, wakeup, wwan_t, cpin_t, reg_t, ack_t, fw_ver_raw, next_t] =
      [
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
      ax, ay, az, gx, gy, gz,
      cn_no, cn_total, cn_max, cn_min,
      cn_avg: cn_no > 0 ? cn_total / cn_no : 0,
      csp, csq, bat_src, wakeup,
      wwan_t: wwan_t / 1000,
      cpin_t: cpin_t / 1000,
      reg_t: reg_t / 1000,
      ack_t: ack_t / 1000,
      fw_ver,
      next_t: next_t * 1000
    };
  } else if (payloadLen === 100) {
    const [gnssft, txtime, solar_v, ax, ay, az, gx, gy, gz, cn_no, cn_total, cn_max, cn_min, csp, csq, bat_src, wakeup, wwan_t, cpin_t, reg_t, ack_t, fw_ver_raw, next_t, crsp, crsq] =
      [
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
      ax, ay, az, gx, gy, gz,
      cn_no, cn_total, cn_max, cn_min,
      cn_avg: cn_no > 0 ? cn_total / cn_no : 0,
      csp, csq, bat_src, wakeup,
      wwan_t: wwan_t / 1000,
      cpin_t: cpin_t / 1000,
      reg_t: reg_t / 1000,
      ack_t: ack_t / 1000,
      fw_ver,
      next_t: next_t * 1000,
      crsp, crsq
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
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('MQTT connection error:', err);
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
  }).catch(err => console.error('InfluxDB write error:', err));
});

app.get('/messages', (req, res) => {
  const queryApi = client.getQueryApi(org);
  const range = req.query.range || '1h'; // 預設 1 小時
  const query = `from(bucket: "${bucket}")
    |> range(start: -${range})
    |> filter(fn: (r) => r._measurement == "device_messages")
    |> filter(fn: (r) => r._field != "message") // 過濾未解析的 message 欄位
    |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`;
  const results = { data: [], notify: [] };

  queryApi.queryRows(query, {
    next(row, tableMeta) {
      const o = tableMeta.toObject(row);
      console.log('Query row:', o);
      const entry = {
        time: o._time,
        device_id: o.device_id,
        id: o.id,
        ts: o.ts,
        imei: o.imei,
        oper: o.oper,
        ip: o.ip
      };
      if (o.type === 'data' && o.log_ts) { // 確保有 log_ts，避免未解析資料
        entry.remark = o.remark;
        entry.log_ts = o.log_ts;
        entry.la = o.la;
        entry.lg = o.lg;
        entry.tmp = o.tmp;
        entry.tiltx = o.tiltx;
        entry.tilty = o.tilty;
        entry.tiltz = o.tiltz;
        entry.corev = o.corev;
        entry.liionv = o.liionv;
        results.data.push(entry);
      } else if (o.type === 'notify' && o.gnssft !== undefined) { // 確保有 gnssft
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
        entry.crsp = o.crsp;
        entry.crsq = o.crsq;
        results.notify.push(entry);
      }
    },
    error(error) {
      console.error('Query error:', error);
      res.status(500).send(error);
    },
    complete() {
      console.log('Query complete:', results);
      res.json(results);
    },
  });
});

app.get('/mqtt-status', (req, res) => {
  res.json({ connected: mqttConnected });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});