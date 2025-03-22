// .netlify/functions/battle.php
exports.handler = async (event, context) => {
  // Динамический импорт node-fetch
  const { default: fetch } = await import('node-fetch');
  
  // Получаем все query-параметры запроса
  const params = event.queryStringParameters || {};
  
  // Формируем URL для запроса к оригинальному серверу
  const url = `https://www.heroeswm.ru/battle.php?${new URLSearchParams(params).toString()}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: res.status,
        body: `Error fetching ${url}`
      };
    }
    
    let html = await res.text();
    // Если необходимо, можно заменить относительные пути на абсолютные
    html = html.replace(/(href|src)=["']\/(?!\/)/g, '$1="https://www.heroeswm.ru/');
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*"  // Разрешаем кросс-доменный доступ
      },
      body: html
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: error.toString()
    };
  }
};
