// netlify/functions/parse-battle.js
const fetch = require('node-fetch'); // Если ваша среда не поддерживает fetch natively

exports.handler = async (event, context) => {
  // Получаем параметры запроса (warid и show) из query string
  const { warid, show } = event.queryStringParameters;
  if (!warid) {
    return {
      statusCode: 400,
      body: "Missing parameter: warid",
    };
  }

  // Формируем URL целевой страницы
  let url = `https://www.heroeswm.ru/war.php?warid=${warid}`;
  if (show) {
    url += `&show=${show}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: res.status,
        body: `Error fetching ${url}`,
      };
    }
    const html = await res.text();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Разрешаем кросс-доменный доступ к этой функции
        "Access-Control-Allow-Origin": "*"
      },
      body: html,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: error.toString(),
    };
  }
};
