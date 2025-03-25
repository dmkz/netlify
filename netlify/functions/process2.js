const cheerio = require('cheerio');
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

// Парсит страницу клана.
// isTechnical = true: для технического клана – ищем в строках дополнительную ссылку на боевой клан.
// isTechnical = false: для боевого клана – просто собираем участников.
function parseClanPage(html, isTechnical) {
  const $ = cheerio.load(html);
  const clanName = $('h1').first().text().trim();
  const tables = $('table');
  const lastTable = tables.last();
  let members = [];
  lastTable.find('tr').each((i, tr) => {
    const aPlayer = $(tr).find('a[href*="pl_info.php?id="]').last();
    if (!aPlayer.length) return;
    const playerIdMatch = aPlayer.attr('href').match(/pl_info\.php\?id=(\d+)/);
    if (!playerIdMatch) return;
    const playerId = playerIdMatch[1];
    const playerName = aPlayer.text().trim();
    let classification = "clanless";
    let joinedBattleClanId = null;
    let joinedBattleClanName = null;
    if (isTechnical) {
      // Для технического клана ищем, есть ли до ссылки с player's name ссылка на боевой клан
      const rowHtml = $(tr).html();
      const playerLinkHtml = aPlayer[0].outerHTML;
      const index = rowHtml.indexOf(playerLinkHtml);
      if (index !== -1) {
        const beforePlayer = rowHtml.substring(0, index);
        const battleMatch = beforePlayer.match(/<a href=["']clan_info\.php\?id=(\d+)["'][^>]*title=['"]([^'"]+)['"]/);
        if (battleMatch) {
          classification = "enemy";
          joinedBattleClanId = battleMatch[1];
          joinedBattleClanName = battleMatch[2];
        }
      }
    }
    members.push({
      id: playerId,
      name: playerName,
      classification,
      joinedBattleClanId,
      joinedBattleClanName
    });
  });
  return { clanName, members };
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
    
    const { techClanIds, battleClanIds } = body;
    const techIds = techClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    const battleIds = battleClanIds.split('\n').map(s => s.trim()).filter(Boolean);
    console.log('Технические кланы (IDs):', techIds);
    console.log('Боевые кланы (IDs):', battleIds);

    // Получаем информацию по техническим кланам (с поиском battle clan у участников)
    const techClans = await Promise.all(techIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос технического клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      const { clanName, members } = parseClanPage(html, true);
      console.log(`Технический клан ${id} (${clanName}) – найдено участников: ${members.length}`);
      return { clanId: id, clanName, members };
    }));

    // Получаем информацию по боевым кланам
    const battleClans = await Promise.all(battleIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос боевого клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      const { clanName, members } = parseClanPage(html, false);
      console.log(`Боевой клан ${id} (${clanName}) – найдено участников: ${members.length}`);
      return { battleClanId: id, battleClanName: clanName, members };
    }));

    // Создаем мапу участников боевых кланов: key = player id, value = { clanId, clanName }
    const battleMembersMap = new Map();
    battleClans.forEach(battleClan => {
      battleClan.members.forEach(member => {
        battleMembersMap.set(member.id, { clanId: battleClan.battleClanId, clanName: battleClan.battleClanName });
      });
    });

    // Формируем результат для каждого технического клана
    const results = techClans.map(techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));

      // inviteGroups: игроки, которые находятся в боевых кланах, но отсутствуют в техническом клане
      const inviteGroups = {};
      battleMembersMap.forEach((info, memberId) => {
        if (!techMemberIds.has(memberId)) {
          if (!inviteGroups[info.clanId]) {
            inviteGroups[info.clanId] = { clanName: info.clanName, players: [] };
          }
          // Находим детальную информацию о игроке из соответствующего боевого клана
          const battleClan = battleClans.find(bc => bc.battleClanId === info.clanId);
          if (battleClan) {
            const memberDetail = battleClan.members.find(m => m.id === memberId);
            if (memberDetail) {
              inviteGroups[info.clanId].players.push(memberDetail);
            }
          }
        }
      });

      // enemyGroups: из технического клана, те игроки, у которых classification === "enemy"
      const enemyGroups = {};
      techClan.members.forEach(member => {
        if (member.classification === 'enemy') {
          if (member.joinedBattleClanId) {
            if (!enemyGroups[member.joinedBattleClanId]) {
              enemyGroups[member.joinedBattleClanId] = { clanName: member.joinedBattleClanName, players: [] };
            }
            enemyGroups[member.joinedBattleClanId].players.push(member);
          } else {
            if (!enemyGroups['unknown']) {
              enemyGroups['unknown'] = { clanName: 'Неизвестный', players: [] };
            }
            enemyGroups['unknown'].players.push(member);
          }
        }
      });

      // clanlessList: игроки технического клана с classification === "clanless"
      const clanlessList = techClan.members.filter(member => member.classification === 'clanless');

      return {
        techClanId: techClan.clanId,
        techClanName: techClan.clanName,
        inviteGroups,
        enemyGroups,
        clanlessList
      };
    });

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
