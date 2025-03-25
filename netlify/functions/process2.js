const iconv = require('iconv-lite');

async function fetchAndDecode(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ошибка при запросе ${url}: статус ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buffer), 'windows-1251');
}

exports.handler = async (event, context) => {
  console.log('Получен запрос:', event.httpMethod);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = JSON.parse(event.body);
    const { techClanIds, battleClanIds } = body;
    const techIds = techClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const battleIds = battleClanIds.split('\n').map(s => s.trim()).filter(Boolean);

    // Получаем HTML для технических кланов
    const techClans = await Promise.all(techIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос технического клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      return { clanId: id, url, html };
    }));

    // Получаем HTML для боевых кланов
    const battleClans = await Promise.all(battleIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос боевого клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      return { clanId: id, url, html };
    }));

    // Формируем итоговый результат с обоими списками
    const results = { techClans, battleClans };

    console.log('Отправляем результаты:', results);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(results, null, 2)
    };
  } catch (error) {
    console.error('Ошибка обработки запроса:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
