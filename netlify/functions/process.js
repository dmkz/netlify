// netlify/functions/process.js
const cheerio = require('cheerio');

exports.handler = async (event, context) => {
  console.log('Получен запрос:', event.httpMethod);
  if (event.httpMethod !== 'POST') {
    console.log('Неподдерживаемый HTTP метод:', event.httpMethod);
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    };
  }

  try {
    // Динамически импортируем node-fetch
    const { default: fetch } = await import('node-fetch');

    // Парсим тело запроса
    const body = JSON.parse(event.body);
    console.log('Полученное тело запроса:', body);
    
    const { techClanIds, battleClanIds, excludePlayers } = body;
    const techIds = techClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const battleIds = battleClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const excludeSet = new Set(
      excludePlayers.split('\n').map(s => s.trim()).filter(Boolean)
    );
    console.log('Технические кланы (IDs):', techIds);
    console.log('Боевые кланы (IDs):', battleIds);
    console.log('Игроки для исключения:', Array.from(excludeSet));

    // Функция для получения информации о клане
    async function fetchClan(clanId) {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${clanId}`;
      console.log(`Запрос к клану ${clanId} по URL: ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Ошибка при получении клана ${clanId}: статус ${res.status}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      // Извлекаем название клана из первого <h1>
      let clanName = $('h1').first().text().trim();
      // Предполагаем, что участники находятся в последней таблице
      const tables = $('table');
      const lastTable = tables.last();
      let members = [];
      lastTable.find('tr').each((i, tr) => {
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
      console.log(`Клан ${clanId} (${clanName}) — найдено участников: ${members.length}`);
      return { clanId, clanName, members };
    }

    // Функция для проверки личной страницы игрока и классификации:
    // Если на странице есть ссылка на clan_info.php, значит игрок в каком-либо клане (enemy);
    // если нет – значит, он без клана (clanless).
    async function classifyPlayer(player) {
      const url = `https://www.heroeswm.ru/pl_info.php?id=${player.id}`;
      console.log(`Проверка игрока ${player.id} по URL: ${url}`);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`Ошибка получения страницы игрока ${player.id}: статус ${res.status}`);
          return { ...player, classification: "unknown" };
        }
        const html = await res.text();
        const $ = cheerio.load(html);
        // Предположим, что если в первой таблице есть ссылка с clan_info.php, то игрок в клане
        const clanLink = $('table').first().find('a[href*="clan_info.php?id="]').first();
        if (clanLink.length > 0) {
          console.log(`Игрок ${player.id} классифицирован как enemy`);
          return { ...player, classification: "enemy" };
        } else {
          console.log(`Игрок ${player.id} классифицирован как clanless`);
          return { ...player, classification: "clanless" };
        }
      } catch (err) {
        console.error(`Ошибка при проверке игрока ${player.id}:`, err);
        return { ...player, classification: "unknown" };
      }
    }

    // Получаем данные для технических и боевых кланов
    const techClans = await Promise.all(techIds.map(id => fetchClan(id)));
    const battleClans = await Promise.all(battleIds.map(id => fetchClan(id)));
    console.log('Получено технических кланов:', techClans.length);
    console.log('Получено боевых кланов:', battleClans.length);

    // Собираем участников боевых кланов в карту (по id)
    const battleMembers = new Map();
    battleClans.forEach(clan => {
      clan.members.forEach(member => {
        battleMembers.set(member.id, member);
      });
    });

    // Для каждого технического клана формируем списки:
    const results = await Promise.all(techClans.map(async techClan => {
      // ids участников технического клана
      const techMemberIds = new Set(techClan.members.map(m => m.id));

      // rawExcludeList — игроки, которые числятся в тех. клане, но не встречаются в боевых кланах (по данным ввода)
      const rawExcludeList = techClan.members.filter(member => !battleMembers.has(member.id));

      // Для каждого такого игрока определяем, в каком он состоянии:
      const classified = await Promise.all(rawExcludeList.map(player => classifyPlayer(player)));

      // Разделяем на enemy и clanless
      const enemyList = classified.filter(p => p.classification === 'enemy');
      const clanlessList = classified.filter(p => p.classification === 'clanless');

      // inviteList — игроки, которые присутствуют в боевых кланах, но отсутствуют в данном техническом клане.
      const inviteList = [];
      battleMembers.forEach(member => {
        if (!techMemberIds.has(member.id)) {
          inviteList.push({
            ...member,
            alreadyExcluded: excludeSet.has(member.id)
          });
        }
      });

      return {
        techClanId: techClan.clanId,
        techClanName: techClan.clanName,
        inviteList,
        enemyList,
        clanlessList
      };
    }));

    console.log('Результаты обработки:', results);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
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
