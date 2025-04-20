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
    // ===== 1. Считываем все примеры (examples) чанками =====
    const chunkSize = 5000;
    let allExamples = [];
    let offset = 0;

    while (true) {
      const { data: examplesChunk, error: examplesError } = await supabase
        .from('examples')
        .select('*')
        .range(offset, offset + chunkSize - 1);

      if (examplesError) {
        throw examplesError;
      }
      if (!examplesChunk || examplesChunk.length === 0) {
        break;
      }

      allExamples.push(...examplesChunk);

      if (examplesChunk.length < chunkSize) {
        break;
      }
      offset += chunkSize;
    }

    console.log(`Получено примеров: ${allExamples.length}`);

    // ===== 2. Считываем все события (events) одним запросом =====
    const { data: allEvents, error: eventsError } = await supabase
      .from('events')
      .select('*');

    if (eventsError) {
      throw eventsError;
    }
    console.log(`Получено событий: ${allEvents.length}`);

    // ===== 3. Отдаём оба массива в ответе =====
    return {
      statusCode: 200,
      body: JSON.stringify({
        events: allEvents,
        examples: allExamples
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
