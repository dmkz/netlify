// netlify/functions/parse-battle.js
exports.handler = async (event, context) => {
  // Динамически импортируем node-fetch и получаем его дефолтный экспорт
  const { default: fetch } = await import('node-fetch');

  // Получаем параметры запроса (warid и show) из query string
  const { warid, show } = event.queryStringParameters || {};
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
    html = html.replace(/(href|src)=["']\/(?!\/)/g, '$1="https://www.heroeswm.ru/');
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
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: error.toString(),
    };
  }
};
