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
    const { data, error } = await supabase
      .from('battles')
      .select('*');

    if (error) {
      throw error;
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
