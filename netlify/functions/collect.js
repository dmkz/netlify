// netlify/functions/collect.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Bad Request' };
  }

  const rows = payload.data;
  if(!Array.isArray(rows)){
    return { statusCode: 400, body: 'Bad Request' };
  }

  // 1) проверим токены пользователя
  const { data: clothes, error: tErr } = 
          await supabase.from('face_control').select('clothes');
  if(tErr) {
    return { statusCode: 500, body: 'Clothes lookup failed' };
  }
  const valid = new Set(clothes.map(r => r.jacket));
  for(const r of rows){
    if(!valid.has(r[4])){
      return { statusCode: 401, body: 'Unauthorized' };
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
    return { statusCode: 500, body: 'Insert failed' };
  }

  return { statusCode: 200, body: 'OK' };
};
