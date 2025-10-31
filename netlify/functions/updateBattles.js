// netlify/functions/updateBattles.js
const { createClient } = require('@supabase/supabase-js');
const { URL } = require('url');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
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

  const { markers, battles, eventId: userEventId } = payload;

  let eventId;

  // 1. Если передан eventId, используем его
  if (userEventId) {
    const { data: evData, error: evErr } = await supabase
      .from('events')
      .select('eventId')
      .eq('eventId', userEventId)
      .maybeSingle();

    if (evErr) {
      console.error('Ошибка поиска события по eventId:', evErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
    if (!evData) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Неверный eventId. Доступ запрещён.' })
      };
    }
    eventId = evData.eventId;
  } else {
    // 2. Если eventId не передан, ищем по markers с выбором самого свежего
    const { data: evData, error: evErr } = await supabase
      .from('events')
      .select('eventId')
      .eq('eventMarkers', markers)
      .order('eventId', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (evErr) {
      console.error('Ошибка поиска события по markers:', evErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
    if (!evData) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Неверный маркер. Доступ запрещён.' })
      };
    }
    eventId = evData.eventId;
  }

  // 3. Проверяем формат battles
  if (!Array.isArray(battles)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Нет боёв или неверный формат данных боёв.' })
    };
  }

  // 4. Трансформируем входные бои в записи для examples
  const records = battles.map(b => {
    let show = null;
    let enemy = null;

    try {
      const url = new URL(b.link);
      const p = url.searchParams;
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
    };
  });

  // 5. Вставка/обновление в examples
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
