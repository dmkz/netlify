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
    // Получаем все записи из таблицы "battles", выполняя запросы чанками по 1000 строк
    const chunkSize = 5000;
    let allBattles = [];
    let chunkStart = 0;
    while (true) {
      const { data, error } = await supabase
        .from('battles')
        .select('*')
        .range(chunkStart, chunkStart + chunkSize - 1);
      if (error) {
        throw error;
      }
      // Если в этом чанке нет данных, завершаем цикл
      if (!data || data.length === 0) {
        break;
      }
      allBattles.push(...data);
      // Если получено меньше, чем запрошено, значит записи закончились
      if (data.length < chunkSize) {
        break;
      }
      chunkStart += chunkSize;
    }
    
    // Выводим в консоль общее количество полученных записей
    console.log("Количество боёв, полученных из базы:", allBattles.length);

    // Получаем значение маркеров из таблицы "settings"
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'eventMarkers')
      .single();
    if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 – запись не найдена
      throw settingsError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        battles: allBattles,
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
