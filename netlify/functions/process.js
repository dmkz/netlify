// netlify/functions/process.js
const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    // Получаем данные из запроса
    const { techClanIds, battleClanIds, excludePlayers } = JSON.parse(event.body);
    
    // Преобразуем строки в массивы идентификаторов (убираем пустые строки и пробелы)
    const techIds = techClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const battleIds = battleClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const excludeSet = new Set(
      excludePlayers.split('\n').map(s => s.trim()).filter(Boolean)
    );

    // Функция для получения информации о клане по id
    async function fetchClan(clanId) {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${clanId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Ошибка при получении клана ${clanId}`);
      const html = await res.text();
      const $ = cheerio.load(html);
      // Извлекаем название клана из первого <h1>
      let clanName = $('h1').first().text().trim();
      // Предполагаем, что участники находятся в самой последней таблице
      const tables = $('table');
      const lastTable = tables.last();
      let members = [];
      lastTable.find('tr').each((i, tr) => {
        // Ищем ссылку на страницу игрока
        const a = $(tr).find('a[href*="pl_info.php?id="]');
        if (a.length > 0) {
          const href = a.attr('href');
          const match = href.match(/pl_info\.php\?id=(\d+)/);
          if (match) {
            members.push({
              id: match[1],
              name: a.text().trim()
            });
          }
        }
      });
      return { clanId, clanName, members };
    }

    // Получаем данные для технических кланов
    const techClans = await Promise.all(techIds.map(id => fetchClan(id)));
    // Получаем данные для боевых кланов
    const battleClans = await Promise.all(battleIds.map(id => fetchClan(id)));

    // Создаём карту всех участников боевых кланов (по id)
    const battleMembers = new Map();
    battleClans.forEach(clan => {
      clan.members.forEach(member => {
        battleMembers.set(member.id, member);
      });
    });

    // Для каждого технического клана формируем списки:
    // 1. Список для исключения: участники тех. клана, которых нет в боевых кланах.
    // 2. Список для приглашения: участники, присутствующие хотя бы в одном боевом клане, но отсутствующие в текущем тех. клане.
    const results = techClans.map(techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));

      // Исключение: участники, которые есть в тех. клане, но не найдены в боевых кланах.
      const excludeList = techClan.members.filter(member => !battleMembers.has(member.id));
      
      // Приглашение: участники из боевых кланов, которых нет в этом тех. клане.
      const inviteList = [];
      battleMembers.forEach(member => {
        if (!techMemberIds.has(member.id)) {
          inviteList.push({
            ...member,
            // Если игрок уже указан в поле исключений, отмечаем это.
            alreadyExcluded: excludeSet.has(member.id)
          });
        }
      });

      return {
        techClanId: techClan.clanId,
        techClanName: techClan.clanName,
        excludeList,
        inviteList
      };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results, null, 2)
    };
  } catch (err) {
    console.error('Ошибка обработки:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
