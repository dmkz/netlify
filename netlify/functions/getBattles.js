// netlify/functions/getBattles.js
const faunadb = require('faunadb');
const q = faunadb.query;

const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET_KEY,  // ключ базы, настройте переменную окружения
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    // Получаем все документы из коллекции "battles"
    const data = await client.query(
      q.Map(
        q.Paginate(q.Documents(q.Collection('battles'))),
        q.Lambda('ref', q.Get(q.Var('ref')))
      )
    );

    return {
      statusCode: 200,
      body: JSON.stringify(data.data),
    };
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
