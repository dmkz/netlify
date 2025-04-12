// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let battles;
  try {
    battles = JSON.parse(event.body); // ожидание, что приходит массив объектов боёв, например: [{ warid, link, result }, ...]
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!Array.isArray(battles)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Expected an array of battles' }) };
  }

  try {
    // Получаем список warid уже имеющихся записей в таблице battles
    const waridList = battles.map(b => b.warid);
    const { data: existingData, error: selectError } = await supabase
      .from('battles')
      .select('warid')
      .in('warid', waridList);

    if (selectError) {
      throw selectError;
    }

    const existingWarIds = existingData.map(record => record.warid);
    // Фильтруем только новые боевые записи
    const newBattles = battles.filter(b => !existingWarIds.includes(b.warid));

    if (newBattles.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No new battles to insert.' }),
      };
    }

    const { data: insertData, error: insertError } = await supabase
      .from('battles')
      .insert(newBattles);

    if (insertError) {
      throw insertError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Battles inserted successfully', data: insertData }),
    };
  } catch (error) {
    console.error('Ошибка добавления данных:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
