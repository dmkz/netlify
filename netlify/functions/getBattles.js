// netlify/functions/getBattles.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  try {
    // Получаем все бои из таблицы "battles"
    const { data: battles, error: battlesError } = await supabase
      .from('battles')
      .select('*');
    if (battlesError) throw battlesError;

    // Получаем значение маркеров из таблицы "settings"
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'eventMarkers')
      .single();
    if (settingsError && settingsError.code !== 'PGRST116') { // код ошибки, если запись не найдена
      throw settingsError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        battles, 
        markers: settings ? settings.value : ''
      }),
    };
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
