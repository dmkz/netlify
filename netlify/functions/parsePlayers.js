const { JSDOM } = require("jsdom");

exports.handler = async (event, context) => {
  console.log('Получен запрос с методом:', event.httpMethod);
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  
  let playerIds;
  try {
    const body = JSON.parse(event.body);
    playerIds = body.playerIds;
    if (!Array.isArray(playerIds)) throw new Error("playerIds must be an array");
  } catch (e) {
    console.error('Ошибка обработки тела запроса:', e);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }
  
  console.log('Получены playerIds:', playerIds);
  
  const results = [];
  for (const id of playerIds) {
    const url = `https://www.heroeswm.ru/pl_info.php?id=${id}`;
    try {
      console.log(`Обработка игрока с id ${id} по URL: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Извлечение имени игрока
      const title = document.querySelector("title")?.textContent || "";
      const match = title.match(/^([^|│]+)/);
      const playerName = match ? match[1].trim() : "Неизвестно";
      
      // Извлечение крафтов
      const crafts = { blacksmith: 0, craft: 0, weapons: 0, armor: 0, jeweler: 0 };
      const xpathResult = document.evaluate(
        "//td[contains(., 'Гильдия') or contains(., 'Мастер') or contains(., 'Ювелир')]",
        document,
        null,
        dom.window.XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        const td = xpathResult.snapshotItem(i);
        const text = td.textContent.trim();
        const patterns = {
          blacksmith: /Гильдия Кузнецов.*?(\d+)/,
          craft: /Гильдия Оружейников.*?(\d+)/,
          weapons: /Мастер оружия.*?(\d+)/,
          armor: /Мастер доспехов.*?(\d+)/,
          jeweler: /Ювелир.*?(\d+)/
        };
        for (const [key, regex] of Object.entries(patterns)) {
          const m = text.match(regex);
          if (m) {
            const value = parseInt(m[1]);
            crafts[key] = Math.max(crafts[key], value);
          }
        }
      }
      
      results.push({ id, name: playerName, crafts });
      console.log(`Успешно обработан игрок ${id}:`, { name: playerName, crafts });
    } catch (e) {
      console.error(`Ошибка для игрока ${id}:`, e);
    }
  }
  
  console.log(`Обработка завершена. Обработано ${results.length} игроков из ${playerIds.length}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ players: results })
  };
};
