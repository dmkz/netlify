// netlify/functions/parser.js
const fetch = require("node-fetch");
const iconv = require("iconv-lite");

exports.handler = async (event, context) => {
  try {
    const { tid, page } = event.queryStringParameters;
    if (!tid || !page) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "tid и page обязательны" }),
      };
    }

    const url = `https://www.heroeswm.ru/forum_messages.php?tid=${tid}&page=${page}`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    // Декодируем из windows-1251:
    const decodedHTML = iconv.decode(Buffer.from(arrayBuffer), "windows-1251");

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=windows-1251" },
      body: decodedHTML,
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
