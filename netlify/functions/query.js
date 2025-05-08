// netlify/functions/query.js

const { createClient } = require('@supabase/supabase-js');

// CORS
const ALLOWED_ORIGIN = 'https://www.heroeswm.ru';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  // preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  const clothes = event.queryStringParameters?.clothes;
  if (!clothes) {
    return { statusCode: 400, headers: CORS, body: 'Bad Request: missing clothes' };
  }

  // проверяем, что такой clothes разрешён (в таблице face_control)
  const { data: validRows, error: err1 } = await supabase
    .from('face_control')
    .select('clothes')
    .eq('clothes', clothes);

  if (err1) {
    return { statusCode: 500, headers: CORS, body: 'DB error' };
  }
  if (!validRows.length) {
    return { statusCode: 401, headers: CORS, body: 'Unauthorized' };
  }

  // получаем все записи по col5 = clothes
  const { data: recs, error: err2 } = await supabase
    .from('collection')
    .select('col1,col2,col3,col4')
    .eq('col5', clothes);

  if (err2) {
    return { statusCode: 500, headers: CORS, body: 'DB error' };
  }

  // возвращаем JSON
  return {
    statusCode: 200,
    headers: { 
      ...CORS,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(recs)
  };
};
