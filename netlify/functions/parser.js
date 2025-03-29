// netlify/functions/parser.js
const iconv = require("iconv-lite");

exports.handler = async (event, context) => {
  console.log("Получены параметры запроса:", event.queryStringParameters);
  
  let fetch;
  try {
    // Динамический импорт node-fetch для работы с ES-модулем
    const module = await import('node-fetch');
    fetch = module.default;
    console.log("node-fetch успешно импортирован.");
  } catch (err) {
    console.error("Ошибка при импорте node-fetch:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Ошибка импорта node-fetch" }),
    };
  }

  try {
    const { tid, page } = event.queryStringParameters;
    if (!tid || !page) {
      console.error("Ошибка: tid и page обязательны");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "tid и page обязательны" }),
      };
    }

    const url = `https://www.heroeswm.ru/forum_messages.php?tid=${tid}&page=${page}`;
    console.log("Формируем URL запроса:", url);

    const response = await fetch(url);
    console.log("Статус ответа от форума:", response.status);

    if (!response.ok) {
      console.error("Ошибка при запросе к форуму:", response.statusText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Ошибка запроса к форуму: " + response.statusText }),
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log("Получен ArrayBuffer, длина:", arrayBuffer.byteLength);

    // Декодирование из windows-1251:
    const decodedHTML = iconv.decode(Buffer.from(arrayBuffer), "windows-1251");
    console.log("Успешно декодирован HTML");

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=windows-1251" },
      body: decodedHTML,
    };
  } catch (error) {
    console.error("Ошибка в функции:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
