// .netlify/functions/parse-battle.js
exports.handler = async (event, context) => {
  // Импортируем node-fetch для выполнения HTTP-запроса
  const { default: fetch } = await import('node-fetch');

  // Получаем параметры запроса: warid и show_for_all
  const { warid, show_for_all } = event.queryStringParameters || {};
  if (!warid) {
    return {
      statusCode: 400,
      body: "Missing parameter: warid",
    };
  }
  if (!show_for_all) {
    return {
      statusCode: 400,
      body: "Missing parameter: show_for_all",
    };
  }

  // Генерируем случайное число для параметра rand
  const rand = Math.random();

  // Формируем URL целевой страницы с фиксированными параметрами
  const url = `https://www.heroeswm.ru/battle.php?warid=${encodeURIComponent(warid)}&lastturn=-2&lastmess=0&lastmess2=0&rand=${rand}&showinsertion=1&pl_id=0&lastdata=1&show_for_all=${encodeURIComponent(show_for_all)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: res.status,
        body: `Error fetching ${url}`,
      };
    }
    let html = await res.text();
    // Заменяем относительные пути на абсолютные, если необходимо
    html = html.replace(/(href|src)=["']\/(?!\/)/g, '$1="https://www.heroeswm.ru/');

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*"  // Разрешаем кросс-доменный доступ
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
