// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Используем service_role для полного доступа
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // Проверяем, что метод запроса POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    // Ожидается, что тело запроса содержит объект с полями battles и markers
    payload = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Проверяем маркер. Если он не равен "Цель контракта", не добавляем данные
  if (payload.markers !== "Цель контракта") {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ error: 'Неверный маркер. Доступ запрещён.' }) 
    };
  }

  // Проверяем, что поле battles существует и имеет корректный формат (массив)
  const battles = payload.battles;
  if (!battles || !Array.isArray(battles)) {
    return { 
      statusCode: 400, 
      body: JSON.stringify({ error: 'Нет боёв или неверный формат данных боёв.' }) 
    };
  }

  try {
    // Добавляем (или обновляем) записи с помощью upsert (если warid уже есть — запись обновится)
    const { data, error } = await supabase
      .from('battles')
      .upsert(battles, { onConflict: 'warid' });

    if (error) {
      throw error;
    }

    return { 
      statusCode: 200, 
      body: JSON.stringify(data) 
    };
  } catch (error) {
    console.error('Ошибка добавления данных:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
