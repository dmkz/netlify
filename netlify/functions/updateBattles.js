// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // используем service_role для полного доступа
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    // Ожидается, что в теле запроса придёт объект вида: { battles: [...], markers: "..." }
    payload = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const battles = payload.battles || [];
  const markers = payload.markers || '';

  try {
    // Обновляем или вставляем боевые записи (upsert по полю "warid")
    const { data: battlesData, error: battlesError } = await supabase
      .from('battles')
      .upsert(battles, { onConflict: 'warid' });
    if (battlesError) {
      throw battlesError;
    }

    // Обновляем значение маркеров в таблице "settings", если значение передано
    if (markers !== '') {
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .upsert({ key: 'eventMarkers', value: markers });
      if (settingsError) {
        throw settingsError;
      }
    }

    return { statusCode: 200, body: JSON.stringify({ battlesData }) };
  } catch (error) {
    console.error('Ошибка добавления данных:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
