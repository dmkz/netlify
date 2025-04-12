// netlify/functions/updateBattles.js
const faunadb = require('faunadb');
const q = faunadb.query;

const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET_KEY, // ключ базы
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let battles;
  try {
    battles = JSON.parse(event.body); // предполагается, что приходит массив объектов боёв
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    // Создадим документы в коллекции "battles" для всех переданных боёв.
    // При этом можно реализовать логику по обновлению существующих (если такой warid уже есть),
    // но в данном примере мы просто добавляем новые.
    const results = await Promise.all(
      battles.map(battle => {
        return client.query(
          q.Create(q.Collection('battles'), { data: battle })
        );
      })
    );

    return { statusCode: 200, body: JSON.stringify(results) };
  } catch (error) {
    console.error('Ошибка добавления данных:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
