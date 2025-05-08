// netlify/functions/collect.js

const { createClient } = require('@supabase/supabase-js');

// Разрешённый Origin
const ALLOWED_ORIGIN = 'https://www.heroeswm.ru';

// Общие заголовки CORS
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS
    };
  }
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Bad Request' };
  }

  const rows = payload.data;
  if(!Array.isArray(rows)){
    return { statusCode: 400, headers: CORS_HEADERS, body: 'Bad Request' };
  }

  // 1) проверим токены пользователя
  const { data: clothes, error: tErr } = 
          await supabase.from('face_control').select('clothes');
  if(tErr) {
    return { statusCode: 500, headers: CORS_HEADERS, body: 'Clothes lookup failed' };
  }
  const valid = new Set(clothes.map(r => r.jacket));
  for(const r of rows){
    if(!valid.has(r[4])){
      return { statusCode: 401, headers: CORS_HEADERS, body: 'Unauthorized' };
    }
  }

  const toInsert = rows.map(r => ({
    col1: r[0],
    col2: r[1],
    col3: r[2],
    col4: r[3],
    col5: r[4]
  }));

  const { error: iErr } = await supabase
    .from('collection')
    .insert(toInsert);

  if(iErr){
    return { statusCode: 500, headers: CORS_HEADERS, body: 'Insert failed' };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: 'OK' };
};
