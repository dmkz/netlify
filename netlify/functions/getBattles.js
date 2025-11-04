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
    const params = event.queryStringParameters || {};
    const page = parseInt(params.page || '0');
    const pageSize = parseInt(params.pageSize || '1000');
    
    const startRange = page * pageSize;
    const endRange = startRange + pageSize - 1;

    console.log(`Запрос страницы ${page}: записи от ${startRange} до ${endRange}`);

    // ВАЖНО: используем .range() для явного указания диапазона
    const { data: examplesChunk, error: examplesError, count } = await supabase
      .from('examples')
      .select('*', { count: 'exact' })
      .range(startRange, endRange);

    if (examplesError) {
      console.error('Ошибка получения examples:', examplesError);
      throw examplesError;
    }

    console.log(`Получено ${examplesChunk?.length || 0} записей из ${count} всего`);

    // События загружаем только на первой странице
    let allEvents = null;
    if (page === 0) {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*');

      if (eventsError) {
        console.error('Ошибка получения events:', eventsError);
        throw eventsError;
      }
      allEvents = events;
      console.log(`Получено ${events?.length || 0} событий`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        events: allEvents,
        examples: examplesChunk || [],
        page: page,
        pageSize: pageSize,
        totalRecords: count,
        totalPages: Math.ceil(count / pageSize),
        recordsInPage: examplesChunk?.length || 0
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
