// netlify/functions/collect.js

const { createClient } = require('@supabase/supabase-js');

// Разрешённый Origin
const ALLOWED_ORIGIN = 'https://www.heroeswm.ru';

// Общие заголовки CORS
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  console.log('--- New invocation of collect.js ---');
  console.log('HTTP Method:', event.httpMethod);

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('Handling CORS preflight (OPTIONS)');
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  try {
    // Only POST
    if (event.httpMethod !== 'POST') {
      console.warn('Rejected non-POST request');
      return {
        statusCode: 405,
        headers: CORS_HEADERS,
        body: 'Method Not Allowed'
      };
    }

    // Parse JSON
    let payload;
    try {
      payload = JSON.parse(event.body);
      console.log('Parsed payload:', payload);
    } catch (err) {
      console.error('JSON parse error:', err);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: 'Bad Request: invalid JSON'
      };
    }

    // Validate rows array
    const rows = payload.data;
    console.log('Rows received:', Array.isArray(rows) ? rows.length : rows);
    if (!Array.isArray(rows)) {
      console.error('Bad payload: data is not array');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: 'Bad Request: data must be array'
      };
    }

    // If no rows, return OK immediately
    if (rows.length === 0) {
      console.log('No rows to insert, returning early');
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: 'OK — no rows to insert'
      };
    }

    // 1) Проверяем токены
    let clothesData, tErr;
    try {
      ({ data: clothesData, error: tErr } = await supabase
        .from('face_control')
        .select('clothes'));
      console.log('face_control lookup result:', clothesData);
    } catch (err) {
      console.error('Supabase query exception:', err);
      tErr = err;
    }
    if (tErr) {
      console.error('Clothes lookup error:', tErr);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: 'Clothes lookup failed'
      };
    }

    const validSet = new Set((clothesData || []).map(r => r.clothes));
    console.log('Valid tokens set:', validSet);

    for (const r of rows) {
      if (!validSet.has(r[4])) {
        console.warn('Unauthorized token in row:', r);
        return {
          statusCode: 401,
          headers: CORS_HEADERS,
          body: 'Unauthorized'
        };
      }
    }

    // 2) Подготовка к вставке
    const toInsert = rows.map(r => ({
      col1: r[0],
      col2: r[1],
      col3: r[2],
      col4: r[3],
      col5: r[4]
    }));
    console.log('Prepared records for insert:', toInsert);

    // 3) Вставка
    let inserted, iErr;
    try {
      ({ data: inserted, error: iErr } = await supabase
        .from('collection')
        .insert(toInsert));
      console.log('Insert response data:', inserted);
    } catch (err) {
      console.error('Supabase insert exception:', err);
      iErr = err;
    }

    if (iErr) {
      console.error('Insert failed:', iErr);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: 'Insert failed'
      };
    }

    const count = Array.isArray(inserted) ? inserted.length : 0;
    console.log('Insert succeeded, rows inserted:', count);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: `OK — inserted ${count} rows`
    };

  } catch (err) {
    console.error('Unexpected error in collect.js:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: 'Internal Server Error'
    };
  }
};
