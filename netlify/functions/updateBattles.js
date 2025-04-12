// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Используем service_role для полного доступа
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let battles;
  try {
    battles = JSON.parse(event.body); // ожидается массив объектов боёв
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    // Вставляем новые боевые записи (обратите внимание: если нужно выполнить обновление существующих,
    // это можно сделать через upsert, см. документацию Supabase)
    const { data, error } = await supabase
      .from('battles')
      .upsert(battles, { onConflict: 'warid' }); // если во входном массиве есть записи с уже существующим warid, они будут обновлены

    if (error) {
      throw error;
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    console.error('Ошибка добавления данных:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
