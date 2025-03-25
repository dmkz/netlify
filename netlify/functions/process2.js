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

// Функция для разбора страницы клана.
// isTechnical === true: для технического клана, где мы пытаемся извлечь информацию о боевом клане у каждого участника.
// battleIdsSet – множество ID боевых кланов, переданное пользователем.
function parseClanPage(html, isTechnical, battleIdsSet) {
  const $ = cheerio.load(html);
  const clanName = $('h1').first().text().trim();
  const tables = $('table');
  const lastTable = tables.last();
  let members = [];
  lastTable.find('tr').each((i, tr) => {
    const rowHtml = $(tr).html();
    // Находим ссылку игрока (используем последнюю найденную ссылку на страницу игрока)
    const aPlayer = $(tr).find('a[href*="pl_info.php?id="]').last();
    if (!aPlayer.length) return;
    const idMatch = aPlayer.attr('href').match(/pl_info\.php\?id=(\d+)/);
    if (!idMatch) return;
    const playerId = idMatch[1];
    const playerName = aPlayer.text().trim();
    // По умолчанию считаем игрока без боевого клана
    let classification = "clanless";
    let joinedBattleClanId = null;
    let joinedBattleClanName = null;
    if (isTechnical) {
      // Определяем, есть ли в HTML строки перед ссылкой игрока ссылка на боевой клан.
      const playerLinkHtml = aPlayer[0].outerHTML;
      const index = rowHtml.indexOf(playerLinkHtml);
      if (index !== -1) {
        const beforePlayer = rowHtml.substring(0, index);
        // Регулярное выражение ищет: <a href="clan_info.php?id=XXX" ... title='YYY'>
        const battleMatch = beforePlayer.match(/<a href=["']clan_info\.php\?id=(\d+)["'][^>]*title=['"]([^'"]+)['"]/);
        if (battleMatch) {
          joinedBattleClanId = battleMatch[1];
          joinedBattleClanName = battleMatch[2];
          // Если найденный боевой клан входит в переданное множество – считаем, что игрок числится корректно ("member"),
          // иначе – игрок ушёл во вражеский клан ("enemy").
          if (battleIdsSet && battleIdsSet.has(joinedBattleClanId)) {
            classification = "member";
          } else {
            classification = "enemy";
          }
        }
      }
    }
    members.push({ id: playerId, name: playerName, classification, joinedBattleClanId, joinedBattleClanName });
  });
  return { clanName, members };
}

exports.handler = async (event, context) => {
  console.log('Получен запрос:', event.httpMethod);
  if (event.httpMethod !== 'POST') {
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
    const battleIdsSet = new Set(battleIds);
    
    // Получаем информацию по техническим кланам
    const techClans = await Promise.all(techIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос технического клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      const { clanName, members } = parseClanPage(html, true, battleIdsSet);
      console.log(`Технический клан ${id} (${clanName}) — найдено участников: ${members.length}`);
      return { clanId: id, clanName, members };
    }));
    
    // Получаем информацию по боевым кланам
    const battleClans = await Promise.all(battleIds.map(async id => {
      const url = `https://www.heroeswm.ru/clan_info.php?id=${id}`;
      console.log(`Запрос боевого клана ${id} по URL: ${url}`);
      const html = await fetchAndDecode(url);
      let { clanName, members } = parseClanPage(html, false, null);
      // Так как это страница боевого клана, все найденные игроки считаются его участниками.
      members = members.map(member => ({
        ...member,
        classification: "member",
        joinedBattleClanId: id,
        joinedBattleClanName: clanName
      }));
      console.log(`Боевой клан ${id} (${clanName}) — найдено участников: ${members.length}`);
      return { battleClanId: id, battleClanName: clanName, members };
    }));
    
    // Создаем мапу участников боевых кланов для формирования списка приглашения
    const battleMembersMap = new Map();
    battleClans.forEach(bc => {
      bc.members.forEach(member => {
        battleMembersMap.set(member.id, { clanId: bc.battleClanId, clanName: bc.battleClanName });
      });
    });
    
    // Формируем результат для каждого технического клана
    const results = techClans.map(techClan => {
      const techMemberIds = new Set(techClan.members.map(m => m.id));
      
      // inviteGroups: игроки, которые числятся в боевых кланах (по данным с боевых кланов),
      // но отсутствуют в техническом клане
      const inviteGroups = {};
      battleMembersMap.forEach((info, memberId) => {
        if (!techMemberIds.has(memberId)) {
          if (!inviteGroups[info.clanId]) {
            inviteGroups[info.clanId] = { clanName: info.clanName, players: [] };
          }
          const battleClan = battleClans.find(bc => bc.battleClanId === info.clanId);
          if (battleClan) {
            const memberDetail = battleClan.members.find(m => m.id === memberId);
            if (memberDetail) {
              inviteGroups[info.clanId].players.push(memberDetail);
            }
          }
        }
      });
      
      // enemyGroups: из технического клана выбираем тех, которые имеют battle-ссылку,
      // и если их joinedBattleClanId отсутствует в battleIdsSet – считаем, что они ушли во вражеский клан
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
      
      // clanlessList: игроки технического клана без ссылки на боевой клан
      const clanlessList = techClan.members.filter(member => member.classification === 'clanless');
      
      return {
        clanId: techClan.clanId,
        clanName: techClan.clanName,
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
