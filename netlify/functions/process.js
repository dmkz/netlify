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
    // Используем динамический импорт для node-fetch, так как он является ES Module
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
    console.log('Боевыe кланы (IDs):', battleIds);
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
      let clanName = $('h1').first().text().trim();
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

    // Получаем информацию для технических и боевых кланов
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
    // 1. Исключения — участники, присутствующие в техническом клане, но отсутствующие в боевых.
    // 2. Приглашения — участники, присутствующие в боевых, но отсутствующие в данном техническом клане.
    const results = techClans.map(techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));
      const excludeList = techClan.members.filter(member => !battleMembers.has(member.id));
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
        excludeList,
        inviteList
      };
    });
    
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
