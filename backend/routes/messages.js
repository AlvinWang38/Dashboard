const express = require('express');
const router = express.Router();
const { InfluxDB } = require('@influxdata/influxdb-client');
const NodeCache = require('node-cache'); // 引入 node-cache
require('dotenv').config();

// 初始化快取，設置 TTL 為 30 秒
const cache = new NodeCache({ stdTTL: 30, checkperiod: 10 });

// InfluxDB 配置
const token = process.env.INFLUXDB_TOKEN || 'my-token';
const org = process.env.INFLUXDB_ORG || 'myorg';
const bucket = process.env.INFLUXDB_BUCKET || 'products';
const client = new InfluxDB({ url: process.env.INFLUXDB_URL || 'http://influxdb:8086', token });

router.get('/', (req, res) => {
  const queryApi = client.getQueryApi(org);
  
  // 根據查詢參數生成快取鍵
  const cacheKey = req.query.from && req.query.to 
    ? `messages_${req.query.from}_${req.query.to}`
    : `messages_${req.query.range || '1h'}`;
  
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
      console.log('Query row:', o);
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
    complete() {
      console.log('Query complete:', results);
      // 將查詢結果存入快取
      cache.set(cacheKey, results);
      res.json(results);
    },
  });
});

module.exports = router;