// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');
const { URL } = require('url');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // service_role
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { markers, battles } = payload;

  // 1. Ищем eventId по eventMarkers
  const { data: evData, error: evErr } = await supabase
    .from('events')
    .select('eventId')
    .eq('eventMarkers', markers)
    .maybeSingle();

  if (evErr) {
    console.error('Ошибка поиска события:', evErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
  if (!evData) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Неверный маркер. Доступ запрещён.' })
    };
  }
  const eventId = evData.eventId;

  // 2. Проверяем формат battles
  if (!Array.isArray(battles)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Нет боёв или неверный формат данных боёв.' })
    };
  }

  // 3. Трансформируем входные бои в записи для examples
  const records = battles.map(b => {
    let show = null;
    let enemy = null;

    try {
      const url = new URL(b.link);
      const p = url.searchParams;
      // варианты названия параметра "show"
      show = p.get('show') || p.get('showt') || p.get('show_for_all');
      enemy = p.get('show_enemy');
    } catch (_) {
      // если ссылка некорректна, оставляем null
    }

    return {
      warid: b.warid,
      show,
      result: b.result,
      eventId,
      enemy
      // date пропускаем — будет default NOW()
    };
  });

  // 4. Вставка/обновление в examples
  try {
    const { data, error } = await supabase
      .from('examples')
      .upsert(records, { onConflict: 'warid' });

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('Ошибка записи в examples:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
