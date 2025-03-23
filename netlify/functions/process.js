// netlify/functions/process.js
const cheerio = require('cheerio');
const iconv = require('iconv-lite');  // убедитесь, что установлена зависимость iconv-lite

// Функция для запроса и декодирования HTML из windows-1251
async function fetchAndDecode(url) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ошибка при запросе ${url}: статус ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const decoded = iconv.decode(Buffer.from(buffer), 'windows-1251');
  return decoded;
}

exports.handler = async (event, context) => {
  console.log('Получен запрос:', event.httpMethod);
  if (event.httpMethod !== 'POST') {
    console.log('Неподдерживаемый HTTP метод:', event.httpMethod);
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { default: fetch } = await import('node-fetch');
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

    // Получаем информацию о клане: название и список участников из последней таблицы
    async function fetchClan(clanId) {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${clanId}`;
      console.log(`Запрос к клану ${clanId} по URL: ${url}`);
      const html = await fetchAndDecode(url);
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

    // Проверка личной страницы игрока и определение его боевого клана (если есть)
    async function classifyPlayer(player) {
      const url = `https://www.heroeswm.ru/pl_info.php?id=${player.id}`;
      console.log(`Проверка игрока ${player.id} по URL: ${url}`);
      try {
        const html = await fetchAndDecode(url);
        const $ = cheerio.load(html);
        const firstTable = $('table').first();
        const clanLink = firstTable.find('a[href*="clan_info.php?id="]').first();
        if (clanLink.length > 0) {
          const href = clanLink.attr('href');
          const match = href.match(/clan_info\.php\?id=(\d+)/);
          let joinedClanId = match ? match[1] : null;
          // Предположим, что текст ссылки содержит и название, например, "#1209 Any Key"
          let linkText = clanLink.text().trim();
          let joinedClanName = linkText.replace(/^#\d+\s*/, '');
          console.log(`Игрок ${player.id} классифицирован как enemy, клан: ${joinedClanId} (${joinedClanName})`);
          return { ...player, classification: "enemy", joinedClanId, joinedClanName };
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

    // Группируем участников боевых кланов: 
    // создаём объект, где ключ — id боевого клана, а значение — массив игроков.
    const battleClanMembers = {};
    battleClans.forEach(clan => {
      battleClanMembers[clan.clanId] = clan.members;
    });
    // Также создаём карту для быстрого поиска игрока по id с информацией о боевом клане
    const battleMembersMap = new Map();
    battleClans.forEach(clan => {
      clan.members.forEach(member => {
        battleMembersMap.set(member.id, { clanId: clan.clanId, clanName: clan.clanName });
      });
    });

    // Для каждого технического клана формируем результаты
    const results = await Promise.all(techClans.map(async techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));

      // Сгруппируем для приглашения по боевым кланам
      const inviteGroups = {};
      battleMembersMap.forEach((info, memberId) => {
        if (!techMemberIds.has(memberId)) {
          if (!inviteGroups[info.clanId]) {
            inviteGroups[info.clanId] = { clanName: info.clanName, players: [] };
          }
          // Найдём данные игрока в массиве участников соответствующего боевого клана
          const memberDetail = battleClanMembers[info.clanId].find(m => m.id === memberId);
          if (memberDetail) {
            inviteGroups[info.clanId].players.push(memberDetail);
          }
        }
      });

      // Для членов технического клана, которых нет в боевых кланах,
      // проверим их личную страницу, чтобы определить, являются ли они "enemy" или "clanless"
      const rawCandidates = techClan.members.filter(member => !battleMembersMap.has(member.id));
      const classified = await Promise.all(rawCandidates.map(player => classifyPlayer(player)));
      // Разделяем по классификации
      const enemyList = classified.filter(p => p.classification === 'enemy');
      const clanlessList = classified.filter(p => p.classification === 'clanless');

      return {
        techClanId: techClan.clanId,
        techClanName: techClan.clanName,
        inviteGroups, // сгруппированные по боевым кланам
        enemyList,    // для каждого enemy – добавлены joinedClanId и joinedClanName
        clanlessList  // игроки, не состоящие ни в одном клане
      };
    }));

    console.log('Результаты обработки:', results);
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
